/**
 * Die **Erstbefüllung**: die letzten 30 Tage Körperdaten, direkt nachdem ein Athlet
 * seine Garmin-Verbindung hergestellt hat (Issue #48).
 *
 * Warum es sie gibt: Ein frisch verbundenes Konto hat noch gar kein Archiv. Bis zum
 * nächsten Cron-Lauf um 5 Uhr morgens sähe das Dashboard genauso aus wie eine kaputte
 * Verbindung — leer. Der Athlet erfährt heute nur, wenn etwas **schief**ging (der
 * Fehler-Marker); gelingt es, sieht es aus wie nichts. Die Erstbefüllung ist der
 * einzige Weg, ihm sofort zu zeigen, dass die Verbindung trägt.
 *
 * Abgrenzung, weil es drei ähnliche Läufe gibt:
 * - **Erstbefüllung** (hier) — einmalig 30 Tage, nach dem Verbinden, wiederholbar.
 * - **Nachlauf** (`koerperdatenNachlauf`) — das 14-Tage-Lückenfenster des nächtlichen
 *   Crons, das die laufende Historie lückenlos hält.
 * - **Backfill** (`scripts/backfill-koerperdaten.ts`) — der bewusste, unbegrenzte Lauf
 *   von Hand.
 *
 * Sie läuft im Hintergrund (`waitUntil`), also sieht niemand zu — und es gibt keine
 * Zustellgarantie. Deshalb ist sie **wiederholbar** und hinterlässt einen
 * **beobachtbaren Zustand**: Ohne ihn könnte die Oberfläche „lädt gerade" nicht von
 * „verbunden, aber leer" unterscheiden, und ein doppelt ausgelöster Lauf gegen ein
 * ratelimitetes Garmin ist genau der Fehler, der sonst passiert.
 *
 * Für Garmin gelten weiter die Auflagen aus ADR-0001: sequentiell, mit Pause zwischen
 * den Tagen. 30 Tage × 5 Endpunkte sind rund 150 Subrequests (Limit 1000); die Pause
 * kostet Wall-Clock, aber kein CPU-Budget.
 */

import { FEHLER_MELDUNG, meldeErfolg, meldeFehler } from "../verbindungen.js";
import type { Koerperdaten } from "./formatKoerperdaten.js";
import type { GarminClient } from "./garminClient.js";
import { buildGarminClient, fetchKoerperdatenLive } from "./koerperdatenLive.js";
import { addDays } from "./koerperdatenNachlauf.js";
import type { KoerperdatenStore } from "./koerperdatenReadThrough.js";

/**
 * Wie weit die Erstbefüllung zurückgeht. Ein Monat ist genug, um im Dashboard einen
 * Verlauf zu sehen statt einzelner Punkte, und klein genug, um in einen
 * Hintergrundlauf zu passen. Wer mehr Historie will, fährt einen Backfill.
 */
export const ERSTBEFUELLUNG_FENSTER_TAGE = 30;

/**
 * Pause zwischen zwei Tagen. Die Connect-API ist inoffiziell und ratelimitet — 30 Tage
 * ohne Luft dazwischen sind der schnellste Weg zu einem 429, und ein 429 mitten in der
 * Erstbefüllung sieht für den Athleten aus wie eine kaputte Verbindung.
 */
export const ERSTBEFUELLUNG_PAUSE_MS = 1000;

/**
 * Wie lange ein als *laufend* markierter Lauf die Wiederholung sperrt. Ein
 * Hintergrundlauf kann verschwinden, ohne sich abzumelden (Worker beendet, Deploy
 * dazwischen) — ohne Ablauf bliebe das Konto dann für immer im Zustand „lädt gerade"
 * und der Knopf wäre tot. Großzügiger als der erwartete Lauf (40–60 s), damit die
 * Sperre nicht mitten in einem gesunden Lauf aufgeht.
 */
export const ERSTBEFUELLUNG_LAUF_TTL_SEKUNDEN = 15 * 60;

/** Der KV-Eintrag, in dem der Zustand des letzten Laufs steht. */
export function erstbefuellungKey(userId: string): string {
  return `user:${userId}:garmin:erstbefuellung`;
}

/**
 * `laeuft` — es wird gerade geholt, ein zweiter Lauf startet nicht. `fertig` — durch,
 * die Zahlen sagen, was dabei herauskam (auch 0 geschriebene Tage ist ein Ergebnis:
 * dann war alles schon da). `gescheitert` — kein einziger Tag kam durch; dazu steht
 * der Fehler-Marker der Verbindung.
 */
export type ErstbefuellungStatus = "laeuft" | "fertig" | "gescheitert";

/**
 * Der beobachtbare Zustand eines Laufs — das, was die Oberfläche liest. Bewusst nur
 * Zahlen und Zeitstempel: rohe Fehlermeldungen gehören ins Log, die Ansage an den
 * Athleten steht im Fehler-Marker.
 */
export interface ErstbefuellungLauf {
  status: ErstbefuellungStatus;
  /** ISO-Zeitstempel des Beginns. */
  begonnen: string;
  /** ISO-Zeitstempel des Endes; fehlt, solange der Lauf läuft. */
  beendet?: string;
  /** Wie viele Tage dieser Lauf zu holen hatte. */
  offen: number;
  /** Wie viele davon im Archiv gelandet sind. */
  geschrieben: number;
  /** Wie viele davon scheiterten. */
  gescheitert: number;
}

export interface ErstbefuellungFensterOptions {
  /** Die bereits archivierten Zeilen des Fensters, in beliebiger Reihenfolge. */
  vorhanden: Koerperdaten[];
  /** Heutiges Datum YYYY-MM-DD in der Zeitzone des Athleten. */
  heute: string;
}

/** Der Anfang des Fensters, das die Erstbefüllung betrachtet — 30 Tage bis heute. */
export function erstbefuellungStart(heute: string): string {
  return addDays(heute, -(ERSTBEFUELLUNG_FENSTER_TAGE - 1));
}

/**
 * Die Tage, die dieser Lauf holen soll — aufsteigend.
 *
 * Genau eine Regel: **ohne Archivzeile wird geholt, mit Archivzeile nicht.** Anders als
 * der Nachlauf frischt die Erstbefüllung nichts auf — sie füllt den Bereich, den ein
 * neues Konto noch gar nicht hat. Heute ist dabei, weil der Athlet gerade hinschaut und
 * ein Zwischenstand von heute Morgen mehr zeigt als eine Lücke; der Cron schreibt ihn
 * morgen früh ohnehin neu (ADR-0002).
 *
 * Dass ein vorhandener Tag nie noch einmal abgerufen wird, ist beim wiederholten Lauf
 * das Wesentliche: Ein zweiter Versuch nach einem Abbruch holt nur den Rest, statt ein
 * ratelimitetes Garmin ein zweites Mal durch dieselben 30 Tage zu schicken.
 */
export function erstzubefuellendeTage({
  vorhanden,
  heute,
}: ErstbefuellungFensterOptions): string[] {
  const archiviert = new Set(vorhanden.map((d) => d.date));
  const tage: string[] = [];

  for (let d = erstbefuellungStart(heute); d <= heute; d = addDays(d, 1)) {
    if (!archiviert.has(d)) tage.push(d);
  }

  return tage;
}

/** Der Zustand des letzten Laufs; unlesbares gilt als keiner. */
export async function leseErstbefuellung(
  kv: KVNamespace,
  userId: string,
): Promise<ErstbefuellungLauf | null> {
  const roh = await kv.get(erstbefuellungKey(userId));
  if (!roh) return null;
  try {
    return JSON.parse(roh) as ErstbefuellungLauf;
  } catch {
    return null;
  }
}

/** Schreibt den Zustand; der laufende bekommt eine TTL, damit er nicht ewig sperrt. */
async function schreibeLauf(
  kv: KVNamespace,
  userId: string,
  lauf: ErstbefuellungLauf,
): Promise<void> {
  await kv.put(
    erstbefuellungKey(userId),
    JSON.stringify(lauf),
    lauf.status === "laeuft"
      ? { expirationTtl: ERSTBEFUELLUNG_LAUF_TTL_SEKUNDEN }
      : undefined,
  );
}

/**
 * Reserviert den Lauf: schreibt den Zustand `laeuft`, wenn keiner läuft.
 *
 * Bewusst ein eigener, **wartbarer** Schritt neben der Ausführung. Der Aufrufer im Web
 * stößt den Lauf im Hintergrund an und antwortet sofort — ohne diese Trennung müsste
 * er antworten, bevor der Zustand geschrieben ist, und die Oberfläche fragte den
 * Fortschritt eines Laufs ab, von dem im KV noch nichts steht. Genau das Loch, in dem
 * ein zweiter Klick landet.
 *
 * Read-then-Write ohne CAS, weil KV keins hat — und KV ist obendrein *eventually
 * consistent*: Ein Lesen kann den gerade geschriebenen Zustand bis zu einer Minute
 * lang noch nicht sehen. Die Sperre ist also **kein Mutex**, sondern hält den Fall ab,
 * für den sie da ist: den Athleten, der eine halbe Minute später noch einmal drückt,
 * weil er nichts passieren sieht.
 *
 * Was im Zweifel passiert, ist ein doppelter Lauf, kein kaputter Zustand — und auch
 * der bleibt begrenzt, weil D1 stark konsistent ist: Der zweite Lauf sieht die vom
 * ersten schon geschriebenen Tage im Archiv und überspringt sie. Für einen Knopf, den
 * ein einzelner Mensch drückt, ist das der richtige Preis; ein echter Mutex bräuchte
 * einen Durable Object, den dieses Deployable bewusst nicht mehr hat (ADR-0007).
 */
export async function reserviereErstbefuellung(
  kv: KVNamespace,
  userId: string,
): Promise<{ reserviert: boolean; lauf: ErstbefuellungLauf }> {
  const laufend = await leseErstbefuellung(kv, userId);
  if (laufend?.status === "laeuft") {
    return { reserviert: false, lauf: laufend };
  }

  const lauf: ErstbefuellungLauf = {
    status: "laeuft",
    begonnen: new Date().toISOString(),
    offen: 0,
    geschrieben: 0,
    gescheitert: 0,
  };
  await schreibeLauf(kv, userId, lauf);
  return { reserviert: true, lauf };
}

export interface ErstbefuellungOptions {
  kv: KVNamespace;
  /** Dieselbe Archiv-Schnittstelle wie im Read-through; `KoerperdatenArchive` erfüllt sie. */
  archiv: KoerperdatenStore;
  userId: string;
  /** Heutiges Datum YYYY-MM-DD in der Zeitzone des Athleten. */
  heute: string;
  /**
   * Nur für Tests: der Weg zu Garmin, die Pause und die Log-Senken. Defaults sind der
   * echte Live-Pfad, eine Sekunde und die Konsole — injiziert, damit ein Testlauf
   * weder Garmin anruft noch dreißig Sekunden schläft.
   */
  buildClient?: (kv: KVNamespace, userId: string) => Promise<GarminClient>;
  fetchLive?: (client: GarminClient, date: string) => Promise<Koerperdaten>;
  pauseMs?: number;
  warte?: (ms: number) => Promise<void>;
  log?: (nachricht: string) => void;
  logFehler?: (nachricht: string) => void;
}

/**
 * Führt einen **bereits reservierten** Lauf aus: holen, upserten, Zustand
 * fortschreiben.
 *
 * Zwei Schritte und keine bequeme Klammer darum: Der einzige Aufrufer reserviert im
 * Request und führt im Hintergrund aus, und eine Komplett-Funktion daneben wäre eine,
 * die nur Tests je aufrufen — ein zweiter Weg durch dieselbe Fachlichkeit, der beim
 * ersten Bruch nicht mitgeprüft wird.
 *
 * Fehler bleiben lokal wie im Cron: Ein gescheiterter Tag blockiert die übrigen nicht.
 * Der Fehler-Marker wird asymmetrisch gesetzt — ein geschriebener Tag beweist, dass die
 * Verbindung trägt; kaputt ist sie erst, wenn kein einziger Tag durchkam.
 */
export async function fuehreErstbefuellungAus({
  kv,
  archiv,
  userId,
  heute,
  begonnen,
  buildClient = buildGarminClient,
  fetchLive = fetchKoerperdatenLive,
  pauseMs = ERSTBEFUELLUNG_PAUSE_MS,
  warte = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log,
  logFehler = console.error,
}: ErstbefuellungOptions & {
  /** Der Zeitstempel aus der Reservierung — damit der Zustand nicht neu anfängt. */
  begonnen: string;
}): Promise<ErstbefuellungLauf> {
  let lauf: ErstbefuellungLauf;

  try {
    const vorhanden = await archiv.readRange(
      userId,
      erstbefuellungStart(heute),
      heute,
    );
    const offen = erstzubefuellendeTage({ vorhanden, heute });

    // Erst die Sperre steht, dann wird angerufen: Scheitert schon der Client-Aufbau
    // (abgerissener Refresh-Token), ist das der `catch` unten — ein Fall, den der
    // Athlet sonst nie erführe.
    const client = await buildClient(kv, userId);

    let geschrieben = 0;
    const gescheitert: string[] = [];

    // Sequentiell mit Pause: die Connect-API ist inoffiziell und ratelimitet (ADR-0001).
    for (const [i, date] of offen.entries()) {
      if (i > 0 && pauseMs > 0) await warte(pauseMs);
      try {
        await archiv.upsert(userId, date, await fetchLive(client, date));
        geschrieben++;
      } catch (err) {
        gescheitert.push(date);
        logFehler(
          `Erstbefüllung ${userId} ${date}: ${(err as Error).message}`,
        );
      }
    }

    if (geschrieben > 0) {
      await meldeErfolg(kv, userId, "garmin");
    } else if (gescheitert.length > 0) {
      await meldeFehler(kv, userId, "garmin", FEHLER_MELDUNG.garmin);
    }

    lauf = {
      // Kein einziger Tag durchgekommen, obwohl welche offen waren: Für den Athleten
      // ist das ein Fehlschlag, auch wenn technisch jeder Tag einzeln scheiterte.
      status: geschrieben === 0 && gescheitert.length > 0 ? "gescheitert" : "fertig",
      begonnen,
      beendet: new Date().toISOString(),
      offen: offen.length,
      geschrieben,
      gescheitert: gescheitert.length,
    };

    log(
      `Erstbefüllung ${userId}: ${offen.length} offen, ${geschrieben} geschrieben, ` +
        `${gescheitert.length} gescheitert` +
        (gescheitert.length ? ` (${gescheitert.join(", ")})` : ""),
    );
  } catch (err) {
    // Vor dem ersten Tag gescheitert — Archiv nicht lesbar oder die Anmeldung trägt
    // nicht mehr. Der Lauf bricht nichts anderes ab: Er hinterlässt den Fehler-Marker
    // und einen Zustand, an dem der Athlet sieht, dass er es noch einmal versuchen kann.
    logFehler(`Erstbefüllung ${userId}: ${(err as Error).message}`);
    await meldeFehler(kv, userId, "garmin", FEHLER_MELDUNG.garmin);
    lauf = {
      status: "gescheitert",
      begonnen,
      beendet: new Date().toISOString(),
      offen: 0,
      geschrieben: 0,
      gescheitert: 0,
    };
  }

  await schreibeLauf(kv, userId, lauf);
  return lauf;
}
