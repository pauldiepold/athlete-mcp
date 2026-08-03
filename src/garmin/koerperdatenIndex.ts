/**
 * Tiefes Modul: der **Körperdaten-Index** — eine mechanisch aus vier Markern
 * gerechnete Zahl von 0 bis 100. Hier liegt die gesamte Bewertungspolitik dieser
 * Fläche: welche Marker zählen, wie ein Messwert zu Punkten wird, wie stark er
 * wiegt und wann gar nicht gerechnet wird. Die Oberfläche bekommt nur Zahlen und
 * urteilt nicht selbst.
 *
 * Der Index ist ausdrücklich **nicht die Tagesform** (siehe CONTEXT.md und
 * ADR-0006). Er ist gerechnet, nicht gedeutet — deshalb ist die
 * **Aufschlüsselung Teil des Vertrags**: zu jedem Index gehören die vier
 * Beiträge, aus denen er entstanden ist, damit an der Oberfläche eine Rechnung
 * mit sichtbaren Bestandteilen steht und kein Urteil.
 *
 * Zwei Regeln tragen das Modul:
 * - **Eine Stelle für die Kalibrierung.** Gewichte und Schwellen stehen in
 *   `KALIBRIERUNG`. Nachjustieren ist eine Zeile plus ein Test und fasst die
 *   Oberfläche nicht an — die Zahlen sind eine Setzung, kein Naturgesetz.
 * - **Lücke statt Schätzung.** Fehlt ein Marker, tragen die übrigen seinen
 *   Anteil mit (Renormalisierung). Fehlen mehr als zwei, gibt es keinen Index.
 *
 * Rein — kein D1, kein Netz, keine Uhr. Eingabe sind die Serien aus
 * `koerperdatenSerien`, also bereits die dichte Kalender-Achse samt ihren
 * Lücken; die Historie darin ist zugleich der Bezugswert der Ruhepuls-Achse.
 */

import { MITTEL_FENSTER, rollierendesMittel } from "./koerperdatenSerien.js";
import type { Kennzahl, KoerperdatenSerien, Serie } from "./koerperdatenSerien.js";

/** Die vier Achsen in der Reihenfolge, in der sie überall auftauchen. */
export const ACHSEN = ["hrv", "schlaf", "ruhepuls", "bereitschaft"] as const;

/** Eine der vier Achsen, aus denen sich der Index zusammensetzt. */
export type Achse = (typeof ACHSEN)[number];

/** Was eine einzelne Achse zum Index eines Tages beiträgt. */
export interface Beitrag {
  achse: Achse;
  /** Punkte der Achse (0–100); `null`, wenn der Marker an diesem Tag fehlt. */
  punkte: number | null;
  /** Das Gewicht, mit dem die Achse an diesem Tag eingeht (0–1). */
  gewicht: number;
  /** `punkte × gewicht`. */
  beitrag: number | null;
}

/** Der Körperdaten-Index eines einzelnen Tages samt Aufschlüsselung. */
export interface Tagesindex {
  /** 0–100; `null`, wenn zu viele Marker fehlen. */
  index: number | null;
  /** Immer alle vier Achsen, in fester Reihenfolge. */
  beitraege: Beitrag[];
}

/** Auf `stellen` Nachkommastellen runden. */
function rund(wert: number, stellen: number): number {
  const faktor = 10 ** stellen;
  return Math.round(wert * faktor) / faktor;
}

/**
 * Die Kalibrierung des Index — **an genau dieser einen Stelle**. Nachjustieren
 * ist damit eine Zeile hier plus ein Test, kein Eingriff in die Oberfläche.
 */
export const KALIBRIERUNG = {
  /** Wie stark die vier Achsen in den Index eingehen; Summe 1. */
  gewichte: {
    hrv: 0.35,
    schlaf: 0.25,
    ruhepuls: 0.2,
    bereitschaft: 0.2,
  } satisfies Record<Achse, number>,
  hrv: {
    /** Punkte an der unteren Grenze des eigenen Baseline-Bands. */
    punkte_band_unten: 70,
    /** Punkte an der oberen Grenze — die Bandmitte liegt damit bei 85. */
    punkte_band_oben: 100,
    /**
     * Wie weit unter der unteren Grenze die Achse auf 0 fällt, gemessen in
     * Bandbreiten. Unterhalb des eigenen Korridors zu liegen ist ein deutliches
     * Signal — die Gerade fällt dort steiler als sie im Band steigt.
     */
    null_bei_bandbreiten_darunter: 1,
  },
  ruhepuls: {
    /**
     * Über wie viele Tage der eigene Median gebildet wird — vier Wochen, lang
     * genug für einen belastbaren Bezugswert und kurz genug, um einer echten
     * Verschiebung des Niveaus zu folgen.
     */
    median_fenster: 28,
    /** Um wie viele Schläge über dem eigenen Median die Achse auf 0 fällt. */
    null_bei_abweichung: 5,
  },
  /**
   * Wie viele der vier Achsen fehlen dürfen, ohne dass der Index verfällt.
   * Darüber gibt es keine Zahl — eine Lücke statt einer Schätzung.
   */
  hoechstens_fehlende_achsen: 2,
} as const;

/**
 * Ein Score der Quelle, der bereits auf derselben 0–100-Skala liegt — auf den
 * gültigen Bereich beschnitten, sonst unverändert übernommen.
 */
function direkt(score: number | null): number | null {
  return score === null ? null : rund(Math.min(Math.max(score, 0), 100), 1);
}

/**
 * Punkte der HRV-Achse: die Position des Nachtwerts im eigenen Baseline-Band.
 * An der unteren Grenze 70, an der oberen 100 — die Bandmitte liegt damit bei
 * 85. Unterhalb der unteren Grenze fällt die Gerade steiler weiter bis 0.
 *
 * Ohne Band gibt es keine Position und damit keine Punkte: ein HRV-Wert für sich
 * genommen sagt nichts, erst der Abstand zum eigenen Korridor macht ihn lesbar.
 */
function hrvPunkte(
  nachtwert: number | null,
  unten: number | null,
  oben: number | null,
): number | null {
  if (nachtwert === null || unten === null || oben === null) return null;

  const breite = oben - unten;
  if (breite <= 0) return null;

  const { punkte_band_unten, punkte_band_oben, null_bei_bandbreiten_darunter } =
    KALIBRIERUNG.hrv;

  const anteil = (nachtwert - unten) / breite;
  const punkte
    = anteil >= 0
      ? punkte_band_unten + anteil * (punkte_band_oben - punkte_band_unten)
      : punkte_band_unten
        * (1 + anteil / null_bei_bandbreiten_darunter);

  return rund(Math.min(Math.max(punkte, 0), 100), 1);
}

/** Der Median einer nicht-leeren Zahlenfolge; bei gerader Anzahl das Mittel der beiden mittleren. */
function median(werte: number[]): number {
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 === 1
    ? sortiert[mitte]!
    : (sortiert[mitte - 1]! + sortiert[mitte]!) / 2;
}

/**
 * Punkte der Ruhepuls-Achse: die Abweichung vom eigenen Median der letzten
 * Wochen. Auf oder unter dem Median volle Punkte — ein niedriger Ruhepuls ist
 * nie ein schlechtes Zeichen; darüber linear fallend bis auf 0.
 *
 * Das Fenster ist der Tag selbst plus die Tage davor, gebildet nur über
 * tatsächlich gemessene Tage. Eine kürzere Historie ist ausdrücklich in Ordnung:
 * wer erst seit einer Woche misst, bekommt seinen Median aus dieser Woche. Am
 * allerersten Tag ist der Wert sein eigener Median und damit ohne Abweichung.
 */
function ruhepulsPunkte(serie: Serie, i: number): number | null {
  const heute = serie[i] ?? null;
  if (heute === null) return null;

  const { median_fenster, null_bei_abweichung } = KALIBRIERUNG.ruhepuls;

  const historie = serie
    .slice(Math.max(0, i - median_fenster + 1), i + 1)
    .filter((w): w is number => w !== null);

  const abweichung = heute - median(historie);
  const punkte = 100 * (1 - abweichung / null_bei_abweichung);
  return rund(Math.min(Math.max(punkte, 0), 100), 1);
}

/**
 * Der Index eines einzelnen Tages der Serien-Achse. `i` ist die Position des
 * Tages; die Serien davor sind die Historie für die Referenzwerte.
 */
export function berechneTagesindex(
  serien: KoerperdatenSerien,
  i: number,
): Tagesindex {
  const punkte: Record<Achse, number | null> = {
    hrv: hrvPunkte(
      serien.hrv.nachtwert[i] ?? null,
      serien.hrv.band_unten[i] ?? null,
      serien.hrv.band_oben[i] ?? null,
    ),
    // Garmins Schlafscore ist bereits eine 0–100-Bewertung derselben Machart —
    // ihn umzurechnen hieße, eine fremde Skala neu zu erfinden.
    schlaf: direkt(serien.schlaf.score[i] ?? null),
    ruhepuls: ruhepulsPunkte(serien.ruhepuls, i),
    // Der Morgenwert — das einzige über Tage vergleichbare Reading (ADR-0002).
    // Auch er ist schon 0–100 und geht deshalb unverändert ein.
    bereitschaft: direkt(serien.bereitschaft.morgenwert[i] ?? null),
  };

  // Nur die gemessenen Achsen tragen — ihre Gewichte werden auf 1 renormalisiert,
  // damit ein fehlender Marker den Index nicht rechnerisch nach unten zieht.
  // Bleiben zu wenige übrig, wird gar nicht gerechnet: eine Lücke ist ehrlicher
  // als eine Zahl, die auf ein oder zwei Markern beruht und wie ein Gesamtbild
  // aussieht. Die gemessenen Punkte bleiben trotzdem sichtbar.
  const vorhanden = ACHSEN.filter((achse) => punkte[achse] !== null);
  const traegt =
    ACHSEN.length - vorhanden.length <= KALIBRIERUNG.hoechstens_fehlende_achsen;

  const gesamtgewicht = vorhanden.reduce(
    (summe, achse) => summe + KALIBRIERUNG.gewichte[achse],
    0,
  );

  const beitraege = ACHSEN.map<Beitrag>((achse) => {
    const eigene = punkte[achse];
    if (eigene === null || !traegt) {
      return { achse, punkte: eigene, gewicht: 0, beitrag: null };
    }

    const gewicht = rund(KALIBRIERUNG.gewichte[achse] / gesamtgewicht, 4);
    // Zwei Nachkommastellen: fein genug, dass sich die vier Beiträge auch nach
    // der Renormalisierung noch zum ausgewiesenen Index summieren.
    return { achse, punkte: eigene, gewicht, beitrag: rund(eigene * gewicht, 2) };
  });

  return {
    // Die Summe der **gezeigten** Beiträge, nicht die gerundete Summe: was die
    // Aufschlüsselung ausweist, muss auch die Zahl ergeben, die darüber steht.
    index: traegt
      ? rund(
          beitraege.reduce((summe, b) => summe + (b.beitrag ?? 0), 0),
          1,
        )
      : null,
    beitraege,
  };
}

/**
 * Der aktuelle Stand des Index, wie ihn die große Kachel zeigt: die Zahl, ihr
 * Abstand zum eigenen Sieben-Tage-Schnitt und die Aufschlüsselung dahinter.
 */
export interface AktuellerIndex extends Kennzahl {
  /**
   * Der Tag, auf den sich dieser Stand bezieht (`YYYY-MM-DD`). Das ist der
   * jüngste Tag **mit** Index — wer die Uhr zwei Nächte nicht getragen hat, soll
   * seinen letzten bekannten Stand sehen und keine leere Kachel. Gibt es gar
   * keinen Tag mit Index, ist es der letzte Tag des Zeitraums; dann ist `wert`
   * `null`, und `beitraege` zeigt immerhin, was an ihm gemessen wurde. Leerer
   * Zeitraum: `null`.
   */
  tag: string | null;
  /** Die Aufschlüsselung dieses Tages — die vier Achsen in fester Reihenfolge. */
  beitraege: Beitrag[];
}

/** Der Körperdaten-Index über einen Zeitraum: Verlauf plus aktueller Stand. */
export interface KoerperdatenIndex {
  /**
   * Ein Index je Tag der Serien-Achse — dieselbe Länge und dieselbe Ordnung wie
   * `serien.tage`. `null` an jedem Tag ohne Index, damit der Verlauf dort eine
   * Lücke zeigt statt einer durchgezogenen Linie.
   */
  serie: Serie;
  aktuell: AktuellerIndex;
}

/**
 * Der Körperdaten-Index über den ganzen Zeitraum. Der Einstiegspunkt für die
 * Oberfläche und für alles, was den Index weiterverrechnet (Wochen-Aggregate).
 */
export function berechneIndex(serien: KoerperdatenSerien): KoerperdatenIndex {
  const tagesindizes = serien.tage.map((_, i) => berechneTagesindex(serien, i));
  const serie = tagesindizes.map((t) => t.index);

  if (serie.length === 0) {
    return {
      serie,
      aktuell: {
        tag: null,
        wert: null,
        schnitt_7: null,
        delta: null,
        beitraege: [],
      },
    };
  }

  // Der jüngste Tag mit Index; gibt es keinen, der letzte Tag des Zeitraums —
  // dessen Aufschlüsselung zeigt dann wenigstens, was gemessen wurde.
  let i = serie.length - 1;
  while (i > 0 && serie[i] === null) i--;

  const wert = serie[i]!;
  const schnitt_7 = rollierendesMittel(serie, MITTEL_FENSTER)[i] ?? null;

  return {
    serie,
    aktuell: {
      tag: serien.tage[i]!,
      wert,
      schnitt_7,
      delta:
        wert === null || schnitt_7 === null ? null : rund(wert - schnitt_7, 1),
      beitraege: tagesindizes[i]!.beitraege,
    },
  };
}
