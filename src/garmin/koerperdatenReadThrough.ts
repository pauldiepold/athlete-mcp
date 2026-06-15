/**
 * Read-through-/Lückenfüller-Orchestrierung (archive-first): liest einen
 * Datumsbereich aus dem Körperdaten-Archiv, lädt fehlende Tage live nach und
 * upsertet sie, gibt den Bereich nach Datum sortiert zurück. Reine Logik gegen
 * die KoerperdatenStore-Schnittstelle + einen Live-Fetcher — D1 und Garmin
 * bleiben außen vor (siehe ADR-0001 koerperdaten-live-api-archive-first).
 */

import type { Koerperdaten } from "./formatKoerperdaten.js";

/** Persistenz-Schnittstelle des Archivs (D1-Impl liefert KoerperdatenArchive). */
export interface KoerperdatenStore {
  readRange(userId: string, start: string, end: string): Promise<Koerperdaten[]>;
  upsert(userId: string, date: string, daten: Koerperdaten): Promise<void>;
}

/** Alle Tage in [start, end] (inklusive) als YYYY-MM-DD, aufsteigend. */
function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= end; ) {
    dates.push(d);
    const next = new Date(`${d}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    d = next.toISOString().slice(0, 10);
  }
  return dates;
}

/**
 * Körperdaten für [start, end] (inklusive). Vorhandene Tage kommen aus dem
 * Archiv; jede Lücke wird über fetchLive geholt, geupsertet und ins Ergebnis
 * gemischt. Ergebnis ist nach Datum aufsteigend sortiert.
 */
export async function getKoerperdatenRange(
  store: KoerperdatenStore,
  fetchLive: (date: string) => Promise<Koerperdaten>,
  userId: string,
  start: string,
  end: string,
): Promise<Koerperdaten[]> {
  const vorhanden = new Map(
    (await store.readRange(userId, start, end)).map((d) => [d.date, d]),
  );

  for (const date of enumerateDates(start, end)) {
    if (vorhanden.has(date)) continue;
    const live = await fetchLive(date);
    await store.upsert(userId, date, live);
    vorhanden.set(date, live);
  }

  return [...vorhanden.values()].sort((a, b) => a.date.localeCompare(b.date));
}
