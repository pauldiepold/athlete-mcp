/**
 * Backfill-CLI (Issue #20): schreibt Körperdaten-Tage eines oder mehrerer Nutzer
 * über dieselbe Live-Kette, die auch Cron und Read-through nutzen.
 *
 *   npm run backfill:koerperdaten -- --user <name>[,<name>…] [--start YYYY-MM-DD]
 *                                    [--end YYYY-MM-DD] [--luecken] [--delay <ms>] [--yes]
 *
 * Zwei Anlässe, ein Werkzeug — beide enden im selben `archive.upsert`:
 *
 * 1. **Altform neu erzeugen** (der ursprüngliche Anlass, #20): Mit ADR-0002 wurde
 *    `training_readiness` vom Objekt zur Liste von Readings und `body_battery`
 *    bekam eine Event-Liste. Ältere Zeilen tragen noch die alte Form; in einer
 *    Range-Abfrage stünden dann beide Formen nebeneinander. Statt die Altform beim
 *    Lesen zu dulden, werden die Zeilen einmal neu erzeugt — über
 *    `fetchKoerperdatenLive`, nicht über einen Sonderpfad, der beim nächsten
 *    Formatwechsel vergessen würde.
 *
 * 2. **Kalenderlücken füllen** (`--luecken`): Der Cron holt nur den Vortag, und ein
 *    an diesem Morgen gescheiterter Garmin-Abruf hinterlässt ein Loch, das von selbst
 *    nie wieder zugeht. Auch die Zeit *vor* dem Onboarding eines Nutzers ist so ein
 *    Loch. Die Read-through-Orchestrierung schließt beides nur für Bereiche, die
 *    jemand tatsächlich abfragt — für die Verlaufsfläche, die 90 Tage am Stück
 *    zeigt, braucht es einen bewussten Lauf. Deshalb opt-in und mit Pflichtgrenzen:
 *    ein Zeitraum, den man versehentlich aufzieht, wären Tausende Abrufe.
 *
 * Übersprungen wird in beiden Fällen, was bereits in Listenform vorliegt — ein Lauf
 * nach Fehlern holt damit von selbst nur das Fehlende nach. **Heute wird nie
 * geschrieben**: über den laufenden Tag legt Garmin noch Readings nach, ein
 * eingefrorener Zwischenstand wäre schlechter als die Lücke (ADR-0002).
 *
 * Die Connect-API ist inoffiziell und ratelimitet (ADR-0001): sequentiell mit
 * Pause, nie parallel — auch nicht über Nutzer hinweg.
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
  users: string[];
  start: string;
  end: string;
  luecken: boolean;
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
  let grenzen = 0;
  let luecken = false;
  let delay = DEFAULT_DELAY_MS;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user") user = argv[++i];
    else if (argv[i] === "--start") (start = argv[++i]!), grenzen++;
    else if (argv[i] === "--end") (end = argv[++i]!), grenzen++;
    else if (argv[i] === "--luecken") luecken = true;
    else if (argv[i] === "--delay") delay = Number(argv[++i]);
    else if (argv[i] === "--yes") yes = true;
    else die(`Unbekanntes Argument: ${argv[i]}`);
  }
  if (!user) die("--user <name>[,<name>…] ist erforderlich");
  const users = user.split(",").map((u) => u.trim());
  if (users.some((u) => u === "")) die(`--user enthält einen leeren Namen: ${user}`);
  for (const [name, wert] of [
    ["--start", start],
    ["--end", end],
  ] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) die(`${name} ist kein YYYY-MM-DD: ${wert}`);
  }
  if (start > end) die(`--start liegt nach --end: ${start} > ${end}`);
  // Ohne vorhandene Zeilen als Anker zieht der Zeitraum die Zahl der Abrufe hoch:
  // ein offener Bereich wären Tausende Garmin-Anfragen (ADR-0001).
  if (luecken && grenzen < 2) die("--luecken verlangt --start und --end");
  if (!Number.isFinite(delay) || delay < 0) die(`--delay ist keine Dauer in ms: ${delay}`);
  return { users, start, end, luecken, delay, yes };
}

const schlafe = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Heutiges Datum in der Zeitzone der Athleten (en-CA liefert ISO-Reihenfolge). */
function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(
    new Date(),
  );
}

/** Alle Tage in [start, end] (inklusive) als YYYY-MM-DD, aufsteigend. */
function kalendertage(start: string, end: string): string[] {
  const tage: string[] = [];
  for (let d = start; d <= end; ) {
    tage.push(d);
    const next = new Date(`${d}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    d = next.toISOString().slice(0, 10);
  }
  return tage;
}

/** Kurze Beschreibung dessen, was ein neu geholter Tag jetzt trägt. */
function ausbeute(daten: Koerperdaten): string {
  const readings = daten.training_readiness?.length ?? 0;
  const events = daten.body_battery?.events?.length ?? 0;
  return `${readings} Reading${readings === 1 ? "" : "s"}, ${events} Event${events === 1 ? "" : "s"}`;
}

/** Zählt Formen und Lücken im Archivbereich — die Verifikation nach dem Lauf. */
async function verifiziere(
  archive: KoerperdatenArchive,
  user: string,
  { start, end, luecken }: Args,
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
  const formen =
    `${zeilen.length} Zeilen im Bereich: ${liste} als Liste, ${objekt} noch als ` +
    `Objekt (alte Form), ${leer} ohne Training Readiness`;
  if (!luecken) return formen;
  const tage = kalendertage(start, end);
  return `${formen}; ${tage.length - zeilen.length} von ${tage.length} Kalendertagen fehlen noch`;
}

/**
 * Die offenen Tage eines Nutzers: alles, was nicht schon als Liste im Archiv
 * steht. Ohne `--luecken` sind das nur vorhandene Zeilen in Altform, mit
 * `--luecken` zusätzlich die Kalendertage ohne Zeile.
 */
function offeneTage(
  vorhanden: Map<string, unknown>,
  { start, end, luecken }: Args,
  heute: string,
): string[] {
  const kandidaten = luecken ? kalendertage(start, end) : [...vorhanden.keys()];
  return kandidaten
    .filter((date) => date < heute)
    .filter((date) => !vorhanden.has(date) || !Array.isArray(vorhanden.get(date)))
    .sort();
}

/** Ein Nutzer, ein Durchgang. Liefert die Zahl der Fehlschläge zurück. */
async function backfillNutzer(
  user: string,
  args: Args,
  kv: ReturnType<typeof remoteKv>,
  archive: KoerperdatenArchive,
): Promise<number> {
  const { start, end, delay } = args;
  const heute = heuteInBerlin();

  log("");
  log(`== Backfill Körperdaten: ${user} ==`);
  log(">> Lese den Archivbereich …");
  const zeilen = await archive.readRange(user, start, end);
  const vorhanden = new Map<string, unknown>(
    zeilen.map((z) => [z.date, z.training_readiness as unknown]),
  );
  const offen = offeneTage(vorhanden, args, heute);
  log(
    `   ${zeilen.length} Zeilen im Bereich [${start}, ${end}], ` +
      `${offen.length} Tage offen.`,
  );
  if (offen.length === 0) {
    log(">> Nichts zu tun.");
    return 0;
  }

  const client = await buildGarminClient(kv, user);

  // --- Probe: was liefert Garmin für den ältesten offenen Tag noch? ---
  log(`>> Probe auf ${offen[0]} (${offen.length} Tage stehen an, ~${offen.length * 5} Abrufe) …`);
  const probe = await probeKoerperdaten({ archive, client, userId: user, date: offen[0]! });
  log("");
  log(formatProbe(probe));
  log("");

  if (
    !args.yes &&
    !(await bestaetige(`Backfill für ${user}: ${offen.length} Tage starten? [j/N] `))
  ) {
    log(">> Abgebrochen, nichts geschrieben.");
    return 0;
  }

  // --- Lauf: sequentiell, Fehler sammeln statt abbrechen ---
  const fehler: { date: string; grund: string }[] = [];
  let geschrieben = 0;

  for (const [i, date] of offen.entries()) {
    const fortschritt = `[${String(i + 1).padStart(String(offen.length).length)}/${offen.length}] ${user} ${date}`;
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
  log(`== Zusammenfassung ${user} ==`);
  log(`   geschrieben: ${geschrieben}`);
  log(`   fehlgeschlagen: ${fehler.length}`);
  for (const { date, grund } of fehler) log(`     ${date}  ${grund}`);
  if (fehler.length) {
    log("   Ein erneuter Lauf holt genau diese Tage nach (Geschriebene werden übersprungen).");
  }
  log(`   Verifikation: ${await verifiziere(archive, user, args)}`);
  return fehler.length;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const kv = remoteKv();
  const archive = new KoerperdatenArchive(remoteD1());

  // Nutzer nacheinander: die Connect-API sieht auch bei getrennten Konten
  // denselben Aufrufer (ADR-0001).
  const fehlerProNutzer = new Map<string, number>();
  for (const user of args.users) {
    fehlerProNutzer.set(user, await backfillNutzer(user, args, kv, archive));
  }

  if (args.users.length > 1) {
    log("");
    log("== Gesamt ==");
    for (const [user, fehler] of fehlerProNutzer) {
      log(`   ${user}: ${fehler === 0 ? "ohne Fehler" : `${fehler} fehlgeschlagen`}`);
    }
  }
}

main().catch((err) => die((err as Error).message));
