/**
 * Read-through-/Lückenfüller-Orchestrierung (archive-first): liest einen
 * Datumsbereich aus dem Körperdaten-Archiv, lädt fehlende Tage live nach und
 * upsertet sie, gibt den Bereich nach Datum sortiert zurück. Heute und gestern
 * kommen dabei nie aus dem Archiv (siehe ADR-0002 koerperdaten-intraday-
 * ereignisbasiert); damit hängt jede Abfrage, die sie einschließt, an Garmins
 * Verfügbarkeit — ein gescheiterter Live-Abruf reißt die Abfrage deshalb nicht
 * ab, sondern wird zu einem Hinweis. Reine Logik gegen die KoerperdatenStore-
 * Schnittstelle + einen Live-Fetcher — D1 und Garmin bleiben außen vor
 * (siehe ADR-0001 koerperdaten-live-api-archive-first).
 */

import type { Koerperdaten } from "./formatKoerperdaten.js";

/** Persistenz-Schnittstelle des Archivs (D1-Impl liefert KoerperdatenArchive). */
export interface KoerperdatenStore {
  readRange(userId: string, start: string, end: string): Promise<Koerperdaten[]>;
  upsert(userId: string, date: string, daten: Koerperdaten): Promise<void>;
}

export interface KoerperdatenRangeOptions {
  store: KoerperdatenStore;
  fetchLive: (date: string) => Promise<Koerperdaten>;
  userId: string;
  /** Startdatum YYYY-MM-DD (inklusive). */
  start: string;
  /** Enddatum YYYY-MM-DD (inklusive). */
  end: string;
  /** Heutiges Datum YYYY-MM-DD in der Zeitzone des Nutzers, vom Aufrufer geliefert. */
  heute: string;
}

export interface KoerperdatenRangeErgebnis {
  koerperdaten: Koerperdaten[];
  /**
   * Prosa-Hinweise zu Tagen, deren Live-Abruf gescheitert ist — gedacht als
   * eigener Content-Block vor dem JSON. Adressat ist ein LLM, dem ein Satz die
   * Konsequenz präziser transportiert als ein Flag am Tages-Objekt (das im
   * zweiten Fehlerfall ohnehin fehlt).
   */
  hinweise: string[];
}

/**
 * Tage, die nie aus dem Archiv kommen: heute, weil Garmin über den Tag Readings
 * nachlegt — und gestern, weil der Cron erst am Morgen danach läuft und der
 * Vortag davor sonst einen eingefrorenen Zwischenstand trüge.
 */
function laufendeTage(heute: string): Set<string> {
  const gestern = new Date(`${heute}T00:00:00Z`);
  gestern.setUTCDate(gestern.getUTCDate() - 1);
  return new Set([heute, gestern.toISOString().slice(0, 10)]);
}

/** Prosa zum gescheiterten Live-Abruf eines Tages, je nachdem ob ein Archivstand einspringt. */
function hinweisZumFehlschlag(date: string, ausArchiv: boolean): string {
  return ausArchiv
    ? `Der Live-Abruf der Körperdaten für ${date} ist fehlgeschlagen. Ausgeliefert wird der zuletzt archivierte Stand dieses Tages — Readings, die Garmin seitdem nachgelegt hat (etwa nach einem Training), fehlen darin möglicherweise.`
    : `Der Live-Abruf der Körperdaten für ${date} ist fehlgeschlagen und es liegt kein archivierter Stand vor. Der Tag fehlt deshalb in den Daten.`;
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
 * Körperdaten für [start, end] (inklusive). Ältere Tage kommen aus dem Archiv;
 * jede Lücke und jeder laufende Tag (heute/gestern) wird über fetchLive geholt,
 * geupsertet und ins Ergebnis gemischt. Scheitert ein Live-Abruf, springt der
 * archivierte Stand ein — oder der Tag fehlt; in beiden Fällen erklärt ein
 * Hinweis, was passiert ist. Ergebnis ist nach Datum aufsteigend sortiert.
 */
export async function getKoerperdatenRange({
  store,
  fetchLive,
  userId,
  start,
  end,
  heute,
}: KoerperdatenRangeOptions): Promise<KoerperdatenRangeErgebnis> {
  const vorhanden = new Map(
    (await store.readRange(userId, start, end)).map((d) => [d.date, d]),
  );

  const laufend = laufendeTage(heute);
  const hinweise: string[] = [];

  for (const date of enumerateDates(start, end)) {
    if (vorhanden.has(date) && !laufend.has(date)) continue;
    try {
      const live = await fetchLive(date);
      await store.upsert(userId, date, live);
      vorhanden.set(date, live);
    } catch (err) {
      console.error(`Live-Abruf Körperdaten ${userId} ${date}:`, err);
      hinweise.push(hinweisZumFehlschlag(date, vorhanden.has(date)));
    }
  }

  return {
    koerperdaten: [...vorhanden.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    hinweise,
  };
}
