/**
 * Der **Hol-Lauf**: eine Liste von Tagen für einen Athleten bei Garmin holen und ins
 * Archiv schreiben — die Schleife, die der tägliche Cron und die Erstbefüllung
 * gemeinsam haben (Issue #55).
 *
 * Beide Läufe unterscheiden sich darin, **welche** Tage sie holen (`nachzuholendeTage`
 * gegen `erstzubefuellendeTage`), und dieser Unterschied ist der fachliche Kern beider
 * — er bleibt deshalb bei ihnen. Gemeinsam ist alles danach: sequentiell durchgehen,
 * gescheiterte Tage sammeln statt abbrechen, den Fehler-Marker asymmetrisch setzen,
 * eine Bilanzzeile loggen.
 *
 * Der Grund für dieses Modul ist die **Marker-Regel**. Sie stand nach Issue #48
 * zweimal wörtlich da, und sie ist genau die Art Regel, die beim nächsten Anfassen an
 * einer Stelle nachgezogen wird und an der anderen nicht — dann meldet der Cron eine
 * Verbindung als kaputt, die die Erstbefüllung für gesund hält.
 *
 * Was hier bewusst **nicht** entschieden wird: die Form des Ergebnisses. Der Lauf gibt
 * Zahlen zurück; ob daraus eine `KoerperdatenCronBilanz` (Task-Ergebnis) oder ein
 * `ErstbefuellungLauf` (KV-Zustand) wird, bleibt beim Aufrufer.
 *
 * Nicht dabei ist `scripts/backfill-koerperdaten.ts`: Der CLI-Lauf schreibt eine
 * Fortschrittszeile pro Tag, reicht den schon geholten Probe-Tag durch und setzt gar
 * keinen Fehler-Marker — ein Mensch sieht ihm zu, deshalb ist Rechenschaft dort etwas
 * anderes. Ihn hier hindurchzuzwingen hieße, drei Callbacks einzuziehen, die nur er
 * benutzt.
 */

import { FEHLER_MELDUNG, meldeErfolg, meldeFehler } from "../verbindungen.js";
import type { Koerperdaten } from "./formatKoerperdaten.js";
import type { GarminClient } from "./garminClient.js";
import { buildGarminClient, fetchKoerperdatenLive } from "./koerperdatenLive.js";
import type { KoerperdatenStore } from "./koerperdatenReadThrough.js";

/**
 * Was ein Lauf erreicht hat — die Zahlen, aus denen die Aufrufer ihre jeweilige Form
 * bauen. Die gescheiterten Tage stehen einzeln drin, weil eine bloße Anzahl weder in
 * die Logzeile noch in eine Fehlersuche trägt.
 */
export interface HolLaufBilanz {
  /** Wie viele Tage dieser Lauf zu holen hatte. */
  offen: number;
  /** Wie viele davon im Archiv gelandet sind. */
  geschrieben: number;
  /** Die Tage, deren Live-Abruf scheiterte. */
  gescheitert: string[];
}

export interface HolLaufOptions {
  kv: KVNamespace;
  /** Nur `upsert` — welche Tage offen sind, hat der Aufrufer schon entschieden. */
  archiv: Pick<KoerperdatenStore, "upsert">;
  userId: string;
  /** Die zu holenden Tage, aufsteigend. Leer ist gültig: dann passiert nichts. */
  tage: string[];
  /**
   * Wie die Logzeilen dieses Laufs anfangen — „Cron Körperdaten" bzw. „Erstbefüllung".
   * In den Worker-Logs stehen beide Läufe nebeneinander; ohne das Etikett wäre nicht
   * zu sehen, welcher gerade klemmt.
   */
  etikett: string;
  /**
   * Pause zwischen zwei Tagen. Die Erstbefüllung holt 30 Tage am Stück und braucht
   * sie (ADR-0001), der Cron holt im Normalfall einen und braucht keine — deshalb
   * gehört sie dem Aufrufer und nicht diesem Modul.
   */
  pauseMs?: number;
  /**
   * Nur für Tests: der Weg zu Garmin, das Warten und die Log-Senken. Defaults sind der
   * echte Live-Pfad, ein echtes `setTimeout` und die Konsole — injiziert, damit ein
   * Testlauf weder Garmin anruft noch wirklich schläft.
   */
  buildClient?: (kv: KVNamespace, userId: string) => Promise<GarminClient>;
  fetchLive?: (client: GarminClient, date: string) => Promise<Koerperdaten>;
  warte?: (ms: number) => Promise<void>;
  log?: (nachricht: string) => void;
  logFehler?: (nachricht: string) => void;
}

/**
 * Holt die übergebenen Tage und schreibt sie ins Archiv.
 *
 * **Wirft**, wenn der Client gar nicht erst entsteht (abgerissener Refresh-Token) —
 * das ist kein Tag, der scheitert, sondern ein Lauf, der nicht stattfindet, und die
 * Aufrufer hinterlassen dafür verschiedene Spuren. Ein einzelner gescheiterter Tag
 * blockiert dagegen die übrigen nicht.
 *
 * Der Fehler-Marker der Garmin-Verbindung wird **asymmetrisch** gesetzt: Ein
 * geschriebener Tag beweist, dass die Verbindung trägt; kaputt ist sie erst, wenn kein
 * einziger von mehreren offenen Tagen durchkam. Ein Lauf ohne offene Tage sagt über
 * die Verbindung nichts und lässt den Marker, wie er ist.
 */
export async function holeKoerperdatenTage({
  kv,
  archiv,
  userId,
  tage,
  etikett,
  pauseMs = 0,
  buildClient = buildGarminClient,
  fetchLive = fetchKoerperdatenLive,
  warte = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log,
  logFehler = console.error,
}: HolLaufOptions): Promise<HolLaufBilanz> {
  const client = await buildClient(kv, userId);

  let geschrieben = 0;
  const gescheitert: string[] = [];

  // Sequentiell: die Connect-API ist inoffiziell und ratelimitet (ADR-0001).
  for (const [i, date] of tage.entries()) {
    if (i > 0 && pauseMs > 0) await warte(pauseMs);
    try {
      await archiv.upsert(userId, date, await fetchLive(client, date));
      geschrieben++;
    } catch (err) {
      gescheitert.push(date);
      logFehler(`${etikett} ${userId} ${date}: ${(err as Error).message}`);
    }
  }

  if (geschrieben > 0) {
    await meldeErfolg(kv, userId, "garmin");
  } else if (gescheitert.length > 0) {
    await meldeFehler(kv, userId, "garmin", FEHLER_MELDUNG.garmin);
  }

  log(
    `${etikett} ${userId}: ${tage.length} offen, ${geschrieben} geschrieben, ` +
      `${gescheitert.length} gescheitert` +
      (gescheitert.length ? ` (${gescheitert.join(", ")})` : ""),
  );

  return { offen: tage.length, geschrieben, gescheitert };
}
