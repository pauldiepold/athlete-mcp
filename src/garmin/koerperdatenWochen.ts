/**
 * Reines Modul: die gemeinsame Datengrundlage der Steuerungs-Brücke (Issue #28).
 * Fasst die Tages-Serien aus `koerperdatenSerien`/`koerperdatenIndex` zu Wochen
 * zusammen — Ø Körperdaten-Index, Ø Schlafdauer, Summe der akuten Last, dazu die
 * HRV-Nachtwerte der Woche für die Mini-Kurve — und verschneidet sie über
 * `isoWoche` mit den vorhandenen Wochen-Keys des Steuerungs-Stores. Beide
 * Richtungen der Brücke lesen von hier: das Dashboard seine Wochenliste, die
 * Steuerungs-Wochenseite ihren Körperdaten-Streifen.
 *
 * Drei Fälle aus dem echten Bestand brauchen keine Sonderbehandlung, weil die
 * Mittelung ohnehin nur über vorhandene Tage läuft:
 * - **Angebrochene Woche** (die laufende): das Aggregat bildet sich über so
 *   viele Tage, wie eben da sind.
 * - **Woche mit Körperdaten, aber ohne Steuerungseintrag**:
 *   `hatSteuerungseintrag: false`, die Aggregate stehen trotzdem.
 * - **Woche mit Steuerungseintrag, aber ohne Körperdaten**: Aggregate `null`,
 *   `hrvSerie: []`, `hatSteuerungseintrag: true`.
 *
 * Eine Woche erscheint in der Ausgabe nur, wenn sie mindestens eine Seite
 * beisteuert — mindestens ein Körperdaten-Wert oder ein Steuerungseintrag. Eine
 * reine Archiv-Lücke ohne jede Spur ist keine Woche, die diese Liste betrifft;
 * sonst würde ein lückenhaftes Mehrjahres-Archiv (siehe PRD, Nutzer mit großen
 * Lücken) die Wochenliste mit leeren Zeilen fluten.
 *
 * Rein — kein D1, kein Netz, keine Uhr. Eingabe sind bereits gerechnete Serien
 * (`koerperdatenSerien`) und der Index (`koerperdatenIndex`), nicht die
 * Tagesblobs selbst — die Achse (`tage`) muss weder vollständig noch lückenlos
 * sein, maßgeblich sind nur die tatsächlich enthaltenen Positionen.
 */

import { isoWoche } from "./isoWoche.js";
import type { Serie } from "./koerperdatenSerien.js";

/** Auf `stellen` Nachkommastellen runden. */
function rund(wert: number, stellen: number): number {
  const faktor = 10 ** stellen;
  return Math.round(wert * faktor) / faktor;
}

/** Mittel einer nicht-leeren Zahlenfolge; `null` bei einer leeren Folge. */
function mittel(werte: number[], stellen: number): number | null {
  if (werte.length === 0) return null;
  return rund(werte.reduce((s, w) => s + w, 0) / werte.length, stellen);
}

/** Summe einer Zahlenfolge; `null` bei einer leeren Folge. */
function summe(werte: number[], stellen: number): number | null {
  if (werte.length === 0) return null;
  return rund(werte.reduce((s, w) => s + w, 0), stellen);
}

/** Die vorhandenen Nicht-`null`-Werte einer Serie. */
function vorhanden(werte: Serie): number[] {
  return werte.filter((w): w is number => w !== null);
}

/** Die Tages-Serien, aus denen die Wochen-Aggregate gebildet werden. */
export interface WochenEingabe {
  /** Jeder Kalendertag der zugrunde liegenden Serien, aufsteigend. */
  tage: string[];
  /** Der Körperdaten-Index je Tag (`berechneIndex(serien).serie`). */
  indexSerie: Serie;
  /** HRV-Nachtwert je Tag (`serien.hrv.nachtwert`). */
  hrvNachtwert: Serie;
  /** Schlafdauer je Tag in Stunden (`serien.schlaf.gesamt_stunden`). */
  schlafStunden: Serie;
  /** Akute Last je Tag (`serien.bereitschaft.akute_last`). */
  akuteLast: Serie;
}

/** Das Aggregat einer einzelnen Woche — die gemeinsame Datengrundlage der Brücke. */
export interface WochenAggregat {
  /** Der Wochen-Key `YYYY-Www`. */
  kw: string;
  /** Ø Körperdaten-Index über die Tage der Woche mit einem Index; `null` ohne einen. */
  indexSchnitt: number | null;
  /** Ø Schlafdauer in Stunden über die Tage der Woche mit einer Messung; `null` ohne eine. */
  schlafStundenSchnitt: number | null;
  /** Summe der akuten Last über die Tage der Woche mit einem Wert; `null` ohne einen. */
  akuteLastSumme: number | null;
  /** HRV-Nachtwerte der Wochentage in Kalenderreihenfolge — die Mini-Kurve der Woche. */
  hrvSerie: Serie;
  /** Ob der Steuerungs-Store zu dieser Woche einen Eintrag hat. */
  hatSteuerungseintrag: boolean;
}

interface WochenGruppe {
  index: number[];
  hrv: Serie;
  schlaf: number[];
  last: number[];
}

/**
 * Aggregiert Tage zu Wochen und verschneidet sie mit den vorhandenen
 * Wochen-Keys des Steuerungs-Stores (`SteuerungStore.listWochen`). Aufsteigend
 * sortiert nach `kw` — das Format ist lexikografisch sortierbar.
 */
export function berechneWochenAggregate(
  eingabe: WochenEingabe,
  steuerungsWochen: string[],
): WochenAggregat[] {
  const nachWoche = new Map<string, WochenGruppe>();

  eingabe.tage.forEach((tag, i) => {
    const kw = isoWoche(tag);
    if (!nachWoche.has(kw)) {
      nachWoche.set(kw, { index: [], hrv: [], schlaf: [], last: [] });
    }
    const gruppe = nachWoche.get(kw)!;

    const index = eingabe.indexSerie[i] ?? null;
    if (index !== null) gruppe.index.push(index);

    gruppe.hrv.push(eingabe.hrvNachtwert[i] ?? null);

    const schlaf = eingabe.schlafStunden[i] ?? null;
    if (schlaf !== null) gruppe.schlaf.push(schlaf);

    const last = eingabe.akuteLast[i] ?? null;
    if (last !== null) gruppe.last.push(last);
  });

  const steuerungsWochenSet = new Set(steuerungsWochen);
  const alleWochen = new Set([...nachWoche.keys(), ...steuerungsWochenSet]);

  const aggregate: WochenAggregat[] = [];
  for (const kw of alleWochen) {
    const gruppe = nachWoche.get(kw);
    const hatSteuerungseintrag = steuerungsWochenSet.has(kw);
    const hatSignal
      = gruppe !== undefined
        && (gruppe.index.length > 0
          || gruppe.schlaf.length > 0
          || gruppe.last.length > 0
          || vorhanden(gruppe.hrv).length > 0);

    if (!hatSignal && !hatSteuerungseintrag) continue;

    aggregate.push({
      kw,
      indexSchnitt: gruppe ? mittel(gruppe.index, 1) : null,
      schlafStundenSchnitt: gruppe ? mittel(gruppe.schlaf, 2) : null,
      akuteLastSumme: gruppe ? summe(gruppe.last, 1) : null,
      hrvSerie: gruppe ? gruppe.hrv : [],
      hatSteuerungseintrag,
    });
  }

  return aggregate.sort((a, b) => a.kw.localeCompare(b.kw));
}
