/**
 * Reines Modul: welche Tage muss der tägliche Cron nachholen, damit die Historie
 * lückenlos bleibt? Kennt weder D1 noch Garmin — es bekommt die archivierten
 * Zeilen eines Fensters und gibt die Daten zurück, die neu geholt werden müssen.
 *
 * Der Cron holte ursprünglich nur den Vortag. Ein an diesem Morgen gescheiterter
 * Abruf hinterließ dann ein Loch, das von selbst nie wieder zuging: die
 * Read-through-Orchestrierung füllt Lücken nur in Bereichen, die jemand
 * tatsächlich abfragt. Statt einer Alarmierung, die jemand lesen müsste, schaut
 * der Cron ein Stück zurück und repariert sich selbst. Siehe ADR-0003
 * (koerperdaten-cron-nachlauffenster).
 */

import type { Koerperdaten } from "./formatKoerperdaten.js";

/**
 * Wie weit der Cron nach fehlenden Tagen sucht. Kostet im Normalbetrieb nichts —
 * ein vorhandener Tag wird nicht abgerufen —, deckt aber jede übliche Störung ab
 * (ein paar Tage Garmin-Zicken, ein verpasster Cron-Lauf). Längere Ausfälle sind
 * ein bewusster Lauf von `scripts/backfill-koerperdaten.ts --luecken`, kein
 * Fensterwert, den man immer weiter aufzieht.
 */
export const LUECKEN_FENSTER_TAGE = 14;

/**
 * Wie lange ein **leerer** Tag noch einmal angefragt wird. Ein Tag ohne jeden
 * Messwert kann echt sein (keine Uhr getragen) oder daran liegen, dass die Uhr
 * beim Cron-Lauf noch nicht synchronisiert hatte. Unterscheiden lässt sich das
 * nicht, also wird kurz nachgefragt und danach geglaubt: sonst würde eine
 * uhrfreie Urlaubswoche jeden Lauf aufs Neue abgefragt.
 */
export const NACHREICH_FENSTER_TAGE = 3;

/** Trägt die Zeile überhaupt einen Messwert? */
function istLeer(daten: Koerperdaten): boolean {
  return (
    daten.hrv === null &&
    daten.sleep === null &&
    daten.stress === null &&
    daten.body_battery === null &&
    daten.training_readiness === null &&
    daten.skin_temp === null
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

/** Datums-Arithmetik auf YYYY-MM-DD (UTC-Mitternacht, kein TZ-Drift). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface NachlaufOptions {
  /** Die bereits archivierten Zeilen des Fensters, in beliebiger Reihenfolge. */
  vorhanden: Koerperdaten[];
  /** Heutiges Datum YYYY-MM-DD in der Zeitzone des Nutzers. */
  heute: string;
}

/**
 * Die Tage, die der Cron holen soll — aufsteigend, ohne heute.
 *
 * Geholt wird ein Tag, wenn
 *  - **gestern**: Garmin legt über den Tag Readings nach, und ein Read-through
 *    kann tagsüber einen Zwischenstand archiviert haben (ADR-0002). Der Cron am
 *    Morgen danach schreibt den endgültigen Stand — immer, auch über eine volle
 *    Zeile;
 *  - **gar keine Zeile** existiert und der Tag im Lücken-Fenster liegt;
 *  - die Zeile **keinen einzigen Messwert** trägt und der Tag im
 *    Nachreich-Fenster liegt (spät synchronisierte Uhr).
 *
 * Heute wird nie geholt: der Tag läuft noch, ein eingefrorener Zwischenstand
 * wäre schlechter als keiner.
 */
export function nachzuholendeTage({ vorhanden, heute }: NachlaufOptions): string[] {
  const gestern = addDays(heute, -1);
  const zeilen = new Map(vorhanden.map((d) => [d.date, d]));
  const nachreichAb = addDays(heute, -NACHREICH_FENSTER_TAGE);

  return kalendertage(addDays(heute, -LUECKEN_FENSTER_TAGE), gestern).filter(
    (date) => {
      if (date === gestern) return true;
      const zeile = zeilen.get(date);
      if (!zeile) return true;
      return istLeer(zeile) && date >= nachreichAb;
    },
  );
}

/** Der Anfang des Fensters, das `nachzuholendeTage` betrachtet. */
export function fensterStart(heute: string): string {
  return addDays(heute, -LUECKEN_FENSTER_TAGE);
}
