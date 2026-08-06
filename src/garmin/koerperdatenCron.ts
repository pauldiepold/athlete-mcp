/**
 * Der tägliche Körperdaten-Cron als Orchestrierung ohne Framework-Bezug: pro Athlet
 * mit Garmin-Bündel die offenen Tage bestimmen, live holen und ins Archiv upserten.
 *
 * Lag früher als `scheduled`-Export in der Worker-Shell (`src/index.ts`) und war
 * damit weder aufrufbar noch testbar. Seit ADR-0007 ist der Cron ein Nitro-Task
 * des einen Deployables; die Fachlichkeit gehört aber in den Garmin-Kontext, nicht
 * in den Task-Adapter. Der Adapter reicht nur KV, D1 und „heute" herein.
 *
 * Archive-first (ADR-0001): Welche Tage geholt werden, entscheidet allein
 * `nachzuholendeTage` — der Cron holt also nicht nur den Vortag, sondern schließt
 * zurückliegende Lücken gleich mit. Damit repariert er sich selbst: ein an einem
 * Morgen gescheiterter Abruf ist am nächsten Morgen wieder ein Kandidat, statt ein
 * Loch zu hinterlassen, das nur ein manueller Backfill je schließt (ADR-0003).
 *
 * Fehler bleiben lokal: ein gescheiterter Tag blockiert die übrigen Tage desselben
 * Athleten nicht und ein gescheiterter Athlet nicht die übrigen.
 */

import { listKvKeys } from "../kvKeys.js";
import { FEHLER_MELDUNG, meldeErfolg, meldeFehler } from "../verbindungen.js";
import type { Koerperdaten } from "./formatKoerperdaten.js";
import type { GarminClient } from "./garminClient.js";
import {
  buildGarminClient,
  fetchKoerperdatenLive,
} from "./koerperdatenLive.js";
import {
  addDays,
  fensterStart,
  nachzuholendeTage,
} from "./koerperdatenNachlauf.js";

/** Der Ausschnitt des Archivs, den der Cron braucht (KoerperdatenArchive erfüllt ihn). */
export interface KoerperdatenCronArchiv {
  readRange(userId: string, start: string, end: string): Promise<Koerperdaten[]>;
  upsert(userId: string, date: string, daten: Koerperdaten): Promise<void>;
}

/**
 * Was ein Lauf pro Athlet erreicht hat. Ohne diese Bilanz wäre ein dauerhaft
 * klemmender Athlet von einem gesunden nicht zu unterscheiden — beim Cron sieht
 * niemand zu, also muss jeder Lauf von sich aus Rechenschaft ablegen.
 *
 * Sie geht als Logzeile raus (das Betriebs-Signal) **und** kommt als Rückgabewert
 * heraus, den der Nitro-Task als Task-Ergebnis weiterreicht.
 */
export interface KoerperdatenCronBilanz {
  userId: string;
  /** Wie viele Tage als nachzuholen erkannt wurden. */
  offen: number;
  /** Wie viele davon tatsächlich im Archiv gelandet sind. */
  geschrieben: number;
  /** Die Tage, deren Live-Abruf scheiterte. */
  gescheitert: string[];
  /**
   * Gesetzt, wenn der Nutzer schon vor dem ersten Tag scheiterte (etwa ein
   * abgerissener Refresh-Token). Dann ist `offen` 0, obwohl Tage offen wären.
   */
  fehler?: string;
}

export interface KoerperdatenCronOptions {
  kv: KVNamespace;
  archiv: KoerperdatenCronArchiv;
  /** Heutiges Datum YYYY-MM-DD in der Zeitzone des Athleten. */
  heute: string;
  /**
   * Nur für Tests: der Weg zu Garmin und die Log-Senken. Defaults sind der echte
   * Live-Pfad und die Konsole — injiziert werden sie, damit ein Testlauf nicht
   * vierzehn Fehlerzeilen pro Fall in die Ausgabe schreibt.
   */
  buildClient?: (kv: KVNamespace, userId: string) => Promise<GarminClient>;
  fetchLive?: (client: GarminClient, date: string) => Promise<Koerperdaten>;
  log?: (nachricht: string) => void;
  logFehler?: (nachricht: string) => void;
}

/**
 * Alle userIds mit einem Garmin-Token-Bündel im KV (`user:<id>:garmin`).
 * Der Anker auf `$` ist wesentlich: `user:<id>:garmin:profile` darf nicht matchen.
 * (Name analog zu `listOnboardedUsers` im Operator-Directory.)
 */
export async function listGarminUsers(kv: KVNamespace): Promise<string[]> {
  const ids: string[] = [];
  for (const name of await listKvKeys(kv, "user:")) {
    const match = name.match(/^user:(.+):garmin$/);
    if (match) ids.push(match[1]!);
  }
  return ids;
}

/** Ein vollständiger Cron-Lauf über alle Athleten mit Garmin-Bündel; eine Bilanz je Athlet. */
export async function laufeKoerperdatenCron({
  kv,
  archiv,
  heute,
  buildClient = buildGarminClient,
  fetchLive = fetchKoerperdatenLive,
  log = console.log,
  logFehler = console.error,
}: KoerperdatenCronOptions): Promise<KoerperdatenCronBilanz[]> {
  const bilanzen: KoerperdatenCronBilanz[] = [];

  for (const userId of await listGarminUsers(kv)) {
    try {
      const vorhanden = await archiv.readRange(
        userId,
        fensterStart(heute),
        addDays(heute, -1),
      );
      const offen = nachzuholendeTage({ vorhanden, heute });

      const client = await buildClient(kv, userId);
      let geschrieben = 0;
      const gescheitert: string[] = [];

      // Sequentiell: die Connect-API ist inoffiziell und ratelimitet (ADR-0001).
      for (const date of offen) {
        try {
          await archiv.upsert(userId, date, await fetchLive(client, date));
          geschrieben++;
        } catch (err) {
          gescheitert.push(date);
          logFehler(
            `Cron Körperdaten ${userId} ${date}: ${(err as Error).message}`,
          );
        }
      }

      // Der Cron ist der verlässlichste Beobachter der Garmin-Verbindung (Issue #44):
      // Er ruft jeden Morgen wirklich an, während ein Athlet wochenlang nichts
      // abfragen kann. Asymmetrisch wie im MCP-Pfad: Ein geschriebener Tag beweist,
      // dass die Verbindung trägt; kaputt ist sie erst, wenn kein einziger von
      // mehreren offenen Tagen durchkam. Ein Lauf ohne offene Tage sagt über die
      // Verbindung nichts und lässt den Marker deshalb, wie er ist — praktisch gibt
      // es ihn nicht, weil `nachzuholendeTage` gestern immer mitnimmt.
      if (geschrieben > 0) {
        await meldeErfolg(kv, userId, "garmin");
      } else if (gescheitert.length > 0) {
        await meldeFehler(kv, userId, "garmin", FEHLER_MELDUNG.garmin);
      }

      log(
        `Cron Körperdaten ${userId}: ${offen.length} offen, ` +
          `${geschrieben} geschrieben, ${gescheitert.length} gescheitert` +
          (gescheitert.length ? ` (${gescheitert.join(", ")})` : ""),
      );
      bilanzen.push({ userId, offen: offen.length, geschrieben, gescheitert });
    } catch (err) {
      // Vor dem ersten Tag gescheitert — etwa ein abgerissener Refresh-Token. Genau
      // der Fall, den der Athlet sonst nie erfährt: Das Archiv füllt sich still nicht
      // mehr. Die übrigen Athleten laufen weiter.
      const fehler = (err as Error).message;
      logFehler(`Cron Körperdaten ${userId}: ${fehler}`);
      await meldeFehler(kv, userId, "garmin", FEHLER_MELDUNG.garmin);
      bilanzen.push({
        userId,
        offen: 0,
        geschrieben: 0,
        gescheitert: [],
        fehler,
      });
    }
  }

  return bilanzen;
}
