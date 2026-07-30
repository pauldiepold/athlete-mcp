/**
 * Probe-CLI: Was liefert Garmin für ein **altes** Datum heute noch — und was
 * würde ein Backfill damit anrichten?
 *
 *   npm run probe:koerperdaten -- --user <name> --date <YYYY-MM-DD> [--json]
 *
 * Zwei Fragen, eine Antwort. Erstens: hält Garmin die Intraday-Readings
 * (`time`, `trigger`) für zurückliegende Tage überhaupt vor? Nur dann gewinnt
 * ein Backfill etwas, das eine reine Formänderung nicht auch hätte (ADR-0002).
 * Zweitens: fällt die Live-Antwort **dünner** aus als die archivierte Zeile?
 * Der Upsert ersetzt die Zeile komplett — eine gealterte Garmin-Antwort würde
 * bestehende Daten überschreiben statt anreichern.
 *
 * Reine Lese-Operation: die Probe schreibt nichts, weder ins Archiv noch ins KV
 * (abgesehen von einem eventuellen Token-Refresh). Der Backfill ruft dieselbe
 * `probeKoerperdaten` vor seinem Lauf auf.
 */

import * as readline from "node:readline";

import type { Koerperdaten } from "../src/garmin/formatKoerperdaten.js";
import type { GarminClient } from "../src/garmin/garminClient.js";
import { KoerperdatenArchive } from "../src/garmin/koerperdatenArchive.js";
import {
  buildGarminClient,
  fetchKoerperdatenLive,
} from "../src/garmin/koerperdatenLive.js";
import { remoteD1, remoteKv } from "./remoteBindings.js";

/**
 * Eine Archivzeile kann noch die alte Form tragen (`training_readiness` als
 * Objekt) — genau der Unterschied, den die Probe sichtbar machen soll.
 */
type ArchivZeile = Omit<Koerperdaten, "training_readiness"> & {
  training_readiness: unknown;
};

/** Die Blöcke einer Körperdaten-Zeile, in der Reihenfolge der Ausgabe. */
const BLOECKE = [
  "hrv",
  "sleep",
  "stress",
  "body_battery",
  "training_readiness",
  "skin_temp",
] as const;

export interface ProbeErgebnis {
  userId: string;
  date: string;
  archiv: ArchivZeile | null;
  live: Koerperdaten;
  /** Blöcke, die im Archiv stehen und in der Live-Antwort fehlen. */
  rueckschritte: string[];
}

/** Holt den Tag live und stellt ihn der archivierten Zeile gegenüber. */
export async function probeKoerperdaten(opts: {
  archive: KoerperdatenArchive;
  client: GarminClient;
  userId: string;
  date: string;
}): Promise<ProbeErgebnis> {
  const { archive, client, userId, date } = opts;
  const archiv = (await archive.read(userId, date)) as ArchivZeile | null;
  const live = await fetchKoerperdatenLive(client, date);

  const rueckschritte = BLOECKE.filter(
    (block) => archiv?.[block] != null && live[block] == null,
  );

  return { userId, date, archiv, live, rueckschritte };
}

/** Kurzbeschreibung eines Blocks für die Gegenüberstellung. */
function beschreibe(block: (typeof BLOECKE)[number], wert: unknown): string {
  if (wert == null) return "—";
  if (block === "training_readiness") {
    return Array.isArray(wert)
      ? `Liste (${wert.length} Reading${wert.length === 1 ? "" : "s"})`
      : "Objekt (alte Form)";
  }
  if (block === "body_battery") {
    const events = (wert as { events?: unknown[] }).events;
    return events?.length ? `${events.length} Events` : "ohne Events";
  }
  return "vorhanden";
}

/** Eine Reading-Zeile: Zeitpunkt, Auslöser, Score, Erholungszeit. */
function readingZeile(r: {
  time: string | null;
  trigger: string | null;
  score: number | null;
  recovery_time_minutes: number | null;
}): string {
  const zeit = (r.time?.slice(11) ?? "??:??").padEnd(6);
  const trigger = (r.trigger ?? "ohne trigger").padEnd(26);
  const recovery =
    r.recovery_time_minutes != null ? `${r.recovery_time_minutes} min Erholung` : "";
  return `  ${zeit} ${trigger} Score ${String(r.score ?? "—").padEnd(4)} ${recovery}`;
}

export function formatProbe(e: ProbeErgebnis): string {
  const zeilen: string[] = [
    `== Probe: ${e.userId} / ${e.date} ==`,
    "",
    `${"Block".padEnd(20)}${"Archiv".padEnd(22)}Live`,
  ];

  for (const block of BLOECKE) {
    zeilen.push(
      block.padEnd(20) +
        beschreibe(block, e.archiv?.[block]).padEnd(22) +
        beschreibe(block, e.live[block]),
    );
  }

  const readings = e.live.training_readiness ?? [];
  zeilen.push("", `Live-Readings (${readings.length}):`);
  zeilen.push(...(readings.length ? readings.map(readingZeile) : ["  keine"]));

  zeilen.push("", "Befund:");
  const mitZeit = readings.filter((r) => r.time !== null).length;
  const mitTrigger = readings.filter((r) => r.trigger !== null).length;
  if (readings.length === 0) {
    zeilen.push(
      "  Garmin liefert für dieses Datum keine Training Readiness mehr — ein",
      "  Backfill gewönne hier nichts gegenüber einer reinen Formänderung.",
    );
  } else if (readings.length === 1 && mitZeit === 0) {
    zeilen.push(
      "  Nur ein Reading, ohne Zeitpunkt — die Intraday-Historie ist für dieses",
      "  Datum nicht mehr vorhanden.",
    );
  } else {
    zeilen.push(
      `  Garmin hält die Intraday-Historie für dieses Datum vor: ${readings.length} Readings,`,
      `  davon ${mitZeit} mit Zeitpunkt und ${mitTrigger} mit trigger. Ein Backfill gewinnt echte Information.`,
    );
  }

  if (e.rueckschritte.length) {
    zeilen.push(
      "",
      `  ⚠ Rückschritt: ${e.rueckschritte.join(", ")} steht im Archiv, fehlt aber live.`,
      "    Ein Upsert würde diese Daten überschreiben.",
    );
  } else if (e.archiv) {
    zeilen.push("  Kein Block geht gegenüber dem Archiv verloren.");
  } else {
    zeilen.push("  (Keine archivierte Zeile für dieses Datum — kein Vergleich möglich.)");
  }

  return zeilen.join("\n");
}

function die(msg: string): never {
  process.stderr.write(`Fehler: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): { user: string; date: string; json: boolean } {
  let user: string | undefined;
  let date: string | undefined;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user") user = argv[++i];
    else if (argv[i] === "--date") date = argv[++i];
    else if (argv[i] === "--json") json = true;
  }
  if (!user) die("--user <name> ist erforderlich");
  if (!date) die("--date <YYYY-MM-DD> ist erforderlich");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`Kein Datum im Format YYYY-MM-DD: ${date}`);
  return { user, date, json };
}

/** Ja/Nein-Rückfrage; alles außer j/ja gilt als Abbruch. */
export function bestaetige(frage: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) =>
    rl.question(frage, (antwort) => {
      rl.close();
      resolve(/^(j|ja)$/i.test(antwort.trim()));
    }),
  );
}

async function main(): Promise<void> {
  const { user, date, json } = parseArgs(process.argv.slice(2));
  const kv = remoteKv();
  const archive = new KoerperdatenArchive(remoteD1());
  const client = await buildGarminClient(kv, user);

  const ergebnis = await probeKoerperdaten({ archive, client, userId: user, date });
  process.stdout.write(`${formatProbe(ergebnis)}\n`);
  if (json) {
    process.stdout.write(
      `\nArchiv:\n${JSON.stringify(ergebnis.archiv, null, 2)}\n` +
        `\nLive:\n${JSON.stringify(ergebnis.live, null, 2)}\n`,
    );
  }
}

// Nur ausführen, wenn direkt gestartet — der Backfill importiert dieses Modul.
if (process.argv[1]?.endsWith("probe-koerperdaten.ts")) {
  main().catch((err) => die((err as Error).message));
}
