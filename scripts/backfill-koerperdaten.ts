/**
 * Backfill-CLI (Issue #20): schreibt archivierte Körperdaten-Zeilen eines
 * Nutzers über dieselbe Live-Kette neu, die auch Cron und Read-through nutzen.
 *
 *   npm run backfill:koerperdaten -- --user <name> [--start YYYY-MM-DD] [--end YYYY-MM-DD]
 *                                    [--delay <ms>] [--yes]
 *
 * Hintergrund: Mit ADR-0002 wurde `training_readiness` vom Objekt zur Liste von
 * Readings und `body_battery` bekam eine Event-Liste. Ältere Zeilen tragen noch
 * die alte Form; in einer Range-Abfrage stünden dann beide Formen nebeneinander.
 * Statt die Altform beim Lesen zu dulden, werden die Zeilen einmal neu erzeugt —
 * über `fetchKoerperdatenLive`, nicht über einen Sonderpfad, der beim nächsten
 * Formatwechsel vergessen würde.
 *
 * Bearbeitet werden **vorhandene Archivzeilen**, keine Kalenderlücken: Lücken zu
 * füllen ist Sache der Read-through-Orchestrierung. Zeilen, die bereits eine
 * Liste tragen, werden übersprungen — ein Lauf nach Fehlern holt damit von
 * selbst nur das Fehlende nach.
 *
 * Die Connect-API ist inoffiziell und ratelimitet (ADR-0001): sequentiell mit
 * Pause, nie parallel.
 */

import type { Koerperdaten } from "../src/garmin/formatKoerperdaten.js";
import { KoerperdatenArchive } from "../src/garmin/koerperdatenArchive.js";
import {
  buildGarminClient,
  fetchKoerperdatenLive,
} from "../src/garmin/koerperdatenLive.js";
import { bestaetige, formatProbe, probeKoerperdaten } from "./probe-koerperdaten.js";
import { remoteD1, remoteKv } from "./remoteBindings.js";

/** Pause zwischen zwei Tagen; jeder Tag sind bereits fünf parallele Abrufe. */
const DEFAULT_DELAY_MS = 1200;

interface Args {
  user: string;
  start: string;
  end: string;
  delay: number;
  yes: boolean;
}

function die(msg: string): never {
  process.stderr.write(`Fehler: ${msg}\n`);
  process.exit(1);
}

function log(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

function parseArgs(argv: string[]): Args {
  let user: string | undefined;
  // Ohne Grenzen: der gesamte archivierte Bereich des Nutzers.
  let start = "0000-01-01";
  let end = "9999-12-31";
  let delay = DEFAULT_DELAY_MS;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user") user = argv[++i];
    else if (argv[i] === "--start") start = argv[++i]!;
    else if (argv[i] === "--end") end = argv[++i]!;
    else if (argv[i] === "--delay") delay = Number(argv[++i]);
    else if (argv[i] === "--yes") yes = true;
    else die(`Unbekanntes Argument: ${argv[i]}`);
  }
  if (!user) die("--user <name> ist erforderlich");
  for (const [name, wert] of [
    ["--start", start],
    ["--end", end],
  ] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) die(`${name} ist kein YYYY-MM-DD: ${wert}`);
  }
  if (!Number.isFinite(delay) || delay < 0) die(`--delay ist keine Dauer in ms: ${delay}`);
  return { user, start, end, delay, yes };
}

const schlafe = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Kurze Beschreibung dessen, was ein neu geholter Tag jetzt trägt. */
function ausbeute(daten: Koerperdaten): string {
  const readings = daten.training_readiness?.length ?? 0;
  const events = daten.body_battery?.events?.length ?? 0;
  return `${readings} Reading${readings === 1 ? "" : "s"}, ${events} Event${events === 1 ? "" : "s"}`;
}

/** Zählt die Formen im Archivbereich — die Verifikation nach dem Lauf. */
async function verifiziere(
  archive: KoerperdatenArchive,
  { user, start, end }: Args,
): Promise<string> {
  const zeilen = await archive.readRange(user, start, end);
  let liste = 0;
  let objekt = 0;
  let leer = 0;
  for (const zeile of zeilen) {
    const tr = zeile.training_readiness as unknown;
    if (Array.isArray(tr)) liste++;
    else if (tr == null) leer++;
    else objekt++;
  }
  return (
    `${zeilen.length} Zeilen im Bereich: ${liste} als Liste, ${objekt} noch als ` +
    `Objekt (alte Form), ${leer} ohne Training Readiness`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { user, start, end, delay } = args;

  const kv = remoteKv();
  const archive = new KoerperdatenArchive(remoteD1());
  const client = await buildGarminClient(kv, user);

  log(`== Backfill Körperdaten: ${user} ==`);
  log(">> Lese den Archivbereich …");
  const zeilen = await archive.readRange(user, start, end);
  if (zeilen.length === 0) die(`Keine Archivzeilen für ${user} in [${start}, ${end}].`);

  const offen = zeilen
    .filter((z) => !Array.isArray(z.training_readiness as unknown))
    .map((z) => z.date);
  log(
    `   ${zeilen.length} Zeilen (${zeilen[0]!.date} … ${zeilen[zeilen.length - 1]!.date}), ` +
      `davon ${zeilen.length - offen.length} bereits in Listenform.`,
  );
  if (offen.length === 0) {
    log(">> Nichts zu tun.");
    return;
  }

  // --- Probe: was liefert Garmin für den ältesten offenen Tag noch? ---
  log(`>> Probe auf ${offen[0]} (${offen.length} Tage stehen an, ~${offen.length * 5} Abrufe) …`);
  const probe = await probeKoerperdaten({ archive, client, userId: user, date: offen[0]! });
  log("");
  log(formatProbe(probe));
  log("");

  if (!args.yes && !(await bestaetige(`Backfill für ${offen.length} Tage starten? [j/N] `))) {
    log(">> Abgebrochen, nichts geschrieben.");
    return;
  }

  // --- Lauf: sequentiell, Fehler sammeln statt abbrechen ---
  const fehler: { date: string; grund: string }[] = [];
  let geschrieben = 0;

  for (const [i, date] of offen.entries()) {
    const fortschritt = `[${String(i + 1).padStart(String(offen.length).length)}/${offen.length}] ${date}`;
    try {
      // Der Probe-Tag ist bereits geholt — nicht ein zweites Mal abrufen.
      const daten =
        date === probe.date ? probe.live : await fetchKoerperdatenLive(client, date);
      await archive.upsert(user, date, daten);
      geschrieben++;
      log(`${fortschritt}  ${ausbeute(daten)}`);
    } catch (err) {
      const grund = (err as Error).message;
      fehler.push({ date, grund });
      log(`${fortschritt}  FEHLER: ${grund}`);
    }
    if (i < offen.length - 1) await schlafe(delay);
  }

  // --- Abschluss: Zusammenfassung + Verifikation gegen das Archiv ---
  log("");
  log("== Zusammenfassung ==");
  log(`   geschrieben: ${geschrieben}`);
  log(`   fehlgeschlagen: ${fehler.length}`);
  for (const { date, grund } of fehler) log(`     ${date}  ${grund}`);
  if (fehler.length) {
    log("   Ein erneuter Lauf holt genau diese Tage nach (Konvertierte werden übersprungen).");
  }

  log("");
  log(">> Verifikation …");
  log(`   ${await verifiziere(archive, args)}`);
}

main().catch((err) => die((err as Error).message));
