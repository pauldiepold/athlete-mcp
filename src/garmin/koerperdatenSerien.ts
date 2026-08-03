/**
 * Tiefes Modul: macht aus den archivierten Tagesblobs benannte, chartfertige
 * Serien. Versteckt vor der Oberfläche (a) die Form des Blobs, (b) die dichte
 * Kalender-Achse und (c) die Lückenbehandlung — die Vue-Schicht bekommt nur noch
 * gleich lange Arrays und muss über Körperdaten nichts wissen.
 *
 * Leitsatz: **Lücken sind Lücken.** Ein Tag ohne Wert ist `null`, nie ein
 * geschätzter oder fortgeschriebener Wert. Die Achse (`tage`) ist deshalb der
 * volle Kalender-Zeitraum und nicht die Menge der archivierten Tage: fehlt ein
 * Tag im Archiv, entsteht an genau seiner Stelle ein Loch statt einer Linie, die
 * über ihn hinwegzieht.
 *
 * Rein — kein D1, kein Netz, keine Uhr (das Bezugsdatum kommt hinein). Gelesen
 * wird ausschließlich über KoerperdatenArchive.readRange. Siehe ADR-0001
 * (archive-first) und ADR-0002 (ereignisbasierte Intraday-Form).
 */

import type { Koerperdaten } from "./formatKoerperdaten.js";

/** Ein Wert je Tag der Achse; `null` ist eine Lücke, kein Nullwert. */
export type Serie = (number | null)[];

/** Ein abgeschlossener Kalender-Zeitraum, beide Grenzen inklusive. */
export interface Zeitraum {
  /** Erster Tag, `YYYY-MM-DD`. */
  von: string;
  /** Letzter Tag, `YYYY-MM-DD`. */
  bis: string;
}

/**
 * Die HRV-Sicht: Garmins Nachtwert gegen das eigene Baseline-Band, dazu der
 * über mehrere Nächte gemittelte Wochenschnitt als ruhigere zweite Linie.
 * Alle vier Serien kommen aus demselben Block des Tagesblobs und sind daher
 * gemeinsam da oder gemeinsam Lücke.
 */
export interface HrvSerien {
  /** HRV der letzten Nacht (`hrv.last_night_avg`). */
  nachtwert: Serie;
  /** Garmins Mehr-Nächte-Mittel (`hrv.weekly_avg`). */
  wochenschnitt: Serie;
  /** Untere Grenze des ausgeglichenen Bands (`hrv.baseline_low`). */
  band_unten: Serie;
  /** Obere Grenze des ausgeglichenen Bands (`hrv.baseline_high`). */
  band_oben: Serie;
}

export interface KoerperdatenSerien {
  /** Jeder Kalendertag des Zeitraums, aufsteigend — die gemeinsame x-Achse. */
  tage: string[];
  hrv: HrvSerien;
}

/** Reine Datums-Arithmetik auf `YYYY-MM-DD` (UTC-Mitternacht, kein TZ-Drift). */
function plusTage(datum: string, tage: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/**
 * Der Zeitraum der letzten `anzahl` Tage bis einschließlich `bis` — die Form,
 * in der die Oberfläche ihren Ausschnitt anfragt („die letzten 30 Tage").
 */
export function letzteTage(bis: string, anzahl: number): Zeitraum {
  return { von: plusTage(bis, -(anzahl - 1)), bis };
}

/** Jeder Kalendertag von `von` bis `bis` (inklusive); leer, wenn `von > bis`. */
export function kalendertage({ von, bis }: Zeitraum): string[] {
  const tage: string[] = [];
  for (let tag = von; tag <= bis; tag = plusTage(tag, 1)) {
    tage.push(tag);
  }
  return tage;
}

/**
 * Rollierendes Mittel über ein Fenster von `fenster` Tagen (der Tag selbst plus
 * die `fenster - 1` davor). Allgemeines Werkzeug für alle Serien.
 *
 * Zwei Regeln, beide gegen erfundene Werte:
 * - Ein Tag ohne eigenen Wert bleibt eine Lücke — das Mittel füllt sie nicht auf.
 * - Gemittelt wird nur über die tatsächlich vorhandenen Werte des Fensters;
 *   Lücken darin zählen weder als Wert noch als Null, es wird also nie über eine
 *   Lücke hinweg interpoliert.
 *
 * Gerundet auf eine Nachkommastelle: mehr wäre Fließkomma-Rauschen im JSON.
 */
export function rollierendesMittel(werte: Serie, fenster: number): Serie {
  return werte.map((wert, i) => {
    if (wert === null) return null;

    let summe = 0;
    let anzahl = 0;
    for (let j = Math.max(0, i - fenster + 1); j <= i; j++) {
      const w = werte[j];
      if (w != null) {
        summe += w;
        anzahl++;
      }
    }
    return Math.round((summe / anzahl) * 10) / 10;
  });
}

/**
 * Die abgeleiteten Serien eines Zeitraums aus den archivierten Tagen. `tage`
 * muss weder vollständig noch lückenlos sein — maßgeblich ist der Zeitraum:
 * jeder Kalendertag darin wird zu genau einer Position in jeder Serie, ein
 * fehlender oder datenloser Tag zu `null`. Tage außerhalb des Zeitraums werden
 * ignoriert.
 */
export function berechneSerien(
  tage: Koerperdaten[],
  zeitraum: Zeitraum,
): KoerperdatenSerien {
  const achse = kalendertage(zeitraum);
  const nachDatum = new Map(tage.map((tag) => [tag.date, tag]));

  const serie = (lies: (tag: Koerperdaten) => number | null): Serie =>
    achse.map((datum) => {
      const tag = nachDatum.get(datum);
      return tag ? lies(tag) : null;
    });

  return {
    tage: achse,
    hrv: {
      nachtwert: serie((t) => t.hrv?.last_night_avg ?? null),
      wochenschnitt: serie((t) => t.hrv?.weekly_avg ?? null),
      band_unten: serie((t) => t.hrv?.baseline_low ?? null),
      band_oben: serie((t) => t.hrv?.baseline_high ?? null),
    },
  };
}
