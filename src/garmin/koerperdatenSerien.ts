/**
 * Tiefes Modul: macht aus den archivierten Tagesblobs benannte, chartfertige
 * Serien (`berechneSerien`) und daraus den aktuellen Stand je Marker
 * (`berechneKennzahlen`). Versteckt vor der Oberfläche (a) die Form des Blobs,
 * (b) die dichte Kalender-Achse, (c) die Lückenbehandlung und (d) die Auswahl,
 * welches Reading eines Tages überhaupt gemeint ist — die Vue-Schicht bekommt nur
 * noch gleich lange Arrays und muss über Körperdaten nichts wissen.
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

import type {
  Koerperdaten,
  TrainingReadinessReading,
} from "./formatKoerperdaten.js";

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

/**
 * Der Auslöser, der ein Training-Readiness-Reading als Morgen-Reset ausweist.
 * Garmin rechnet den Score mehrfach am Tag neu; nur dieses eine Reading ist
 * über Tage hinweg vergleichbar (ADR-0002).
 */
const AUSLOESER_MORGEN = "AFTER_WAKEUP_RESET";

/**
 * Das Fenster aller rollierenden Mittel dieser Fläche: eine Woche. Kurz genug,
 * um einer Änderung zu folgen, lang genug, um eine einzelne Nacht nicht
 * durchschlagen zu lassen.
 */
export const MITTEL_FENSTER = 7;

/**
 * Die Bereitschafts-Sicht: der über Tage vergleichbare Morgenwert gegen den
 * Tagesendstand der akuten Last.
 */
export interface BereitschaftSerien {
  /**
   * Score des Readings mit dem Auslöser `AFTER_WAKEUP_RESET`. Bewusst **kein**
   * Rückfall auf „das früheste Reading des Tages": ein Post-Exercise-Reading ist
   * mit einem Morgen-Reading nicht vergleichbar, und Readings ohne Auslöser (u. a.
   * ältere) sagen nicht, was sie sind. Ein Tag ohne Morgen-Reading ist eine
   * Lücke, kein geschätzter Wert (ADR-0002).
   */
  morgenwert: Serie;
  /**
   * Der Tagesendstand von Garmins akuter Last: die `acute_load` des **spätesten**
   * Readings des Tages. Anders als beim Morgenwert ist hier gerade der jüngste
   * Stand gefragt — die Last des Tages ist am Abend vollständig.
   */
  akute_last: Serie;
}

/**
 * Die Schlaf-Sicht. Dauern kommen im Blob in Sekunden und gehen hier in
 * **Stunden** hinaus — die Einheit, in der über Schlaf gesprochen und in der er
 * gelesen wird; die Oberfläche soll nicht rechnen müssen.
 */
export interface SchlafSerien {
  /** Garmins Schlafdauer (`sleep.duration_seconds`) in Stunden. */
  gesamt_stunden: Serie;
  tief_stunden: Serie;
  leicht_stunden: Serie;
  rem_stunden: Serie;
  wach_stunden: Serie;
  /** Garmins Schlafscore (0–100). */
  score: Serie;
  /**
   * Sieben-Tage-Mittel der Gesamtdauer — die ruhigere Linie, an der ein
   * chronisches Defizit sichtbar wird, das einzelne Nächte verstecken.
   */
  gesamt_mittel_7: Serie;
}

/**
 * Die Body-Battery-Sicht. Beide Seiten kommen als positive Zahlen aus Garmin;
 * die Bilanz macht daraus das Vorzeichen, an dem ein Zehrtag von einem Ladetag
 * zu unterscheiden ist.
 */
export interface BodyBatterySerien {
  /** Über den Tag geladen (`body_battery.charged`). */
  geladen: Serie;
  /** Über den Tag verbraucht (`body_battery.drained`), positiv gezählt. */
  verbraucht: Serie;
  /**
   * Geladen minus verbraucht: positiv an einem Ladetag, negativ an einem
   * Zehrtag. Fehlt eine der beiden Seiten, ist die Bilanz eine Lücke — eine
   * fehlende Seite als Null zu rechnen würde einen Tag erfinden.
   */
  bilanz: Serie;
}

export interface KoerperdatenSerien {
  /** Jeder Kalendertag des Zeitraums, aufsteigend — die gemeinsame x-Achse. */
  tage: string[];
  hrv: HrvSerien;
  bereitschaft: BereitschaftSerien;
  schlaf: SchlafSerien;
  /** Ruhepuls der Nacht in Schlägen pro Minute (`sleep.resting_heart_rate`). */
  ruhepuls: Serie;
  /**
   * Abweichung der nächtlichen Hauttemperatur von der eigenen Norm, in Grad
   * Celsius. Nur, wenn die Uhr sie tatsächlich gemessen hat: `data_exists:
   * false` ist keine Abweichung von 0, sondern eine Lücke — und in vielen Zeilen
   * der Normalfall.
   */
  hauttemperatur_abweichung: Serie;
  /** Tagesdurchschnitt des Stresslevels (`stress.avg`). */
  stress: Serie;
  body_battery: BodyBatterySerien;
}

/**
 * Das späteste Reading eines Tages. `formatKoerperdaten` sortiert die Liste zwar
 * bereits, aber die Reihenfolge im Blob ist nichts, worauf sich eine Rechnung
 * verlassen sollte — hier wird sie über den Zeitpunkt selbst festgestellt.
 */
function spaetestesReading(
  readings: TrainingReadinessReading[],
): TrainingReadinessReading | null {
  return readings.reduce<TrainingReadinessReading | null>(
    (spaetestes, r) =>
      spaetestes === null || (r.time ?? "") >= (spaetestes.time ?? "")
        ? r
        : spaetestes,
    null,
  );
}

/**
 * Sekunden als Stunden, auf zwei Nachkommastellen (rund eine halbe Minute) —
 * fein genug für gestapelte Balken, grob genug, um kein Fließkomma-Rauschen ins
 * JSON zu schreiben.
 */
function stunden(sekunden: number | null | undefined): number | null {
  return sekunden == null ? null : Math.round((sekunden / 3600) * 100) / 100;
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

  const schlafGesamt = serie((t) => stunden(t.sleep?.duration_seconds));

  return {
    tage: achse,
    hrv: {
      nachtwert: serie((t) => t.hrv?.last_night_avg ?? null),
      wochenschnitt: serie((t) => t.hrv?.weekly_avg ?? null),
      band_unten: serie((t) => t.hrv?.baseline_low ?? null),
      band_oben: serie((t) => t.hrv?.baseline_high ?? null),
    },
    bereitschaft: {
      morgenwert: serie(
        (t) =>
          t.training_readiness?.find((r) => r.trigger === AUSLOESER_MORGEN)
            ?.score ?? null,
      ),
      akute_last: serie(
        (t) => spaetestesReading(t.training_readiness ?? [])?.acute_load ?? null,
      ),
    },
    schlaf: {
      gesamt_stunden: schlafGesamt,
      tief_stunden: serie((t) => stunden(t.sleep?.deep_seconds)),
      leicht_stunden: serie((t) => stunden(t.sleep?.light_seconds)),
      rem_stunden: serie((t) => stunden(t.sleep?.rem_seconds)),
      wach_stunden: serie((t) => stunden(t.sleep?.awake_seconds)),
      score: serie((t) => t.sleep?.score ?? null),
      gesamt_mittel_7: rollierendesMittel(schlafGesamt, MITTEL_FENSTER),
    },
    ruhepuls: serie((t) => t.sleep?.resting_heart_rate ?? null),
    hauttemperatur_abweichung: serie((t) =>
      t.skin_temp?.data_exists ? (t.skin_temp.deviation_celsius ?? null) : null,
    ),
    stress: serie((t) => t.stress?.avg ?? null),
    body_battery: {
      geladen: serie((t) => t.body_battery?.charged ?? null),
      verbraucht: serie((t) => t.body_battery?.drained ?? null),
      bilanz: serie((t) => {
        const geladen = t.body_battery?.charged;
        const verbraucht = t.body_battery?.drained;
        return geladen == null || verbraucht == null ? null : geladen - verbraucht;
      }),
    },
  };
}

/**
 * Der aktuelle Stand eines Markers, wie ihn eine Kachel zeigt: der jüngste
 * gemessene Wert, sein Sieben-Tage-Schnitt und der Abstand dazwischen.
 */
export interface Kennzahl {
  /** Der jüngste vorhandene Wert im Zeitraum; `null`, wenn es keinen gibt. */
  wert: number | null;
  /** Der Tag dieses Werts (`YYYY-MM-DD`) — er muss nicht der letzte des Zeitraums sein. */
  tag: string | null;
  /**
   * Sieben-Tage-Schnitt bis einschließlich `tag`, gebildet nur über die
   * tatsächlich gemessenen Tage darin.
   */
  schnitt_7: number | null;
  /** `wert` minus `schnitt_7` — „für mich hoch" oder „für mich niedrig". */
  delta: number | null;
}

/** Die HRV-Kachel trägt zusätzlich das eigene Baseline-Band des Tages. */
export interface HrvKennzahl extends Kennzahl {
  band_unten: number | null;
  band_oben: number | null;
}

/** Der aktuelle Stand aller Marker der Kachelzeile. */
export interface Kennzahlen {
  hrv: HrvKennzahl;
  schlaf_stunden: Kennzahl;
  schlaf_score: Kennzahl;
  ruhepuls: Kennzahl;
  body_battery_bilanz: Kennzahl;
  bereitschaft_morgenwert: Kennzahl;
  akute_last: Kennzahl;
}

/** Index des jüngsten vorhandenen Werts einer Serie; -1, wenn es keinen gibt. */
function letzterWertIndex(werte: Serie): number {
  for (let i = werte.length - 1; i >= 0; i--) {
    if (werte[i] != null) return i;
  }
  return -1;
}

/**
 * Der aktuelle Stand aus den Serien eines Zeitraums.
 *
 * Bezugspunkt ist bewusst der **jüngste gemessene** Tag, nicht der letzte Tag
 * des Zeitraums: wer die Uhr zwei Nächte nicht getragen hat, soll seinen Stand
 * sehen und keine leere Kachel. Der Tag steht deshalb mit in der Kennzahl.
 */
export function berechneKennzahlen(serien: KoerperdatenSerien): Kennzahlen {
  const kennzahl = (werte: Serie): Kennzahl => {
    const i = letzterWertIndex(werte);
    if (i < 0) return { wert: null, tag: null, schnitt_7: null, delta: null };

    const wert = werte[i]!;
    const schnitt_7 = rollierendesMittel(werte, MITTEL_FENSTER)[i]!;
    return {
      wert,
      tag: serien.tage[i]!,
      schnitt_7,
      delta: Math.round((wert - schnitt_7) * 10) / 10,
    };
  };

  // Das Band gehört zum Tag des Nachtwerts, nicht zum letzten Tag des Zeitraums:
  // Garmin verschiebt die Grenzen langsam mit, und die Kachel soll den Wert in
  // dem Band zeigen, in dem er gemessen wurde.
  const hrvIndex = letzterWertIndex(serien.hrv.nachtwert);

  return {
    hrv: {
      ...kennzahl(serien.hrv.nachtwert),
      band_unten: hrvIndex < 0 ? null : (serien.hrv.band_unten[hrvIndex] ?? null),
      band_oben: hrvIndex < 0 ? null : (serien.hrv.band_oben[hrvIndex] ?? null),
    },
    schlaf_stunden: kennzahl(serien.schlaf.gesamt_stunden),
    schlaf_score: kennzahl(serien.schlaf.score),
    ruhepuls: kennzahl(serien.ruhepuls),
    body_battery_bilanz: kennzahl(serien.body_battery.bilanz),
    bereitschaft_morgenwert: kennzahl(serien.bereitschaft.morgenwert),
    akute_last: kennzahl(serien.bereitschaft.akute_last),
  };
}
