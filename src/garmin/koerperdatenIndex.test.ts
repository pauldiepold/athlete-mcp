import { describe, it, expect } from "vitest";
import type { Koerperdaten } from "./formatKoerperdaten.js";
import { berechneSerien } from "./koerperdatenSerien.js";
import type { KoerperdatenSerien } from "./koerperdatenSerien.js";
import { ACHSEN, berechneIndex, berechneTagesindex } from "./koerperdatenIndex.js";
import type { Achse, Beitrag, Tagesindex } from "./koerperdatenIndex.js";

/**
 * Die vier Marker eines Tages, so knapp wie möglich notiert. Was nicht dasteht,
 * hat die Uhr nicht gemessen — also eine Lücke, keine Null.
 */
interface TagSpec {
  /** HRV-Nachtwert in ms. */
  hrv?: number;
  /** Untere und obere Grenze des eigenen Baseline-Bands. */
  band?: [number, number];
  /** Garmins Schlafscore. */
  schlaf?: number;
  /** Ruhepuls der Nacht in Schlägen pro Minute. */
  ruhepuls?: number;
  /** Morgenwert der Training Readiness. */
  bereitschaft?: number;
}

const ERSTER_TAG = "2026-07-01";

/** Reine Datums-Arithmetik auf `YYYY-MM-DD`. */
function plusTage(datum: string, tage: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Ein archivierter Tagesblob aus der knappen Notation. */
function blob(date: string, spec: TagSpec): Koerperdaten {
  return {
    date,
    hrv:
      spec.hrv === undefined && spec.band === undefined
        ? null
        : {
            status: "BALANCED",
            last_night_avg: spec.hrv ?? null,
            weekly_avg: null,
            baseline_low: spec.band?.[0] ?? null,
            baseline_high: spec.band?.[1] ?? null,
          },
    sleep:
      spec.schlaf === undefined && spec.ruhepuls === undefined
        ? null
        : {
            duration_seconds: null,
            deep_seconds: null,
            light_seconds: null,
            rem_seconds: null,
            awake_seconds: null,
            score: spec.schlaf ?? null,
            score_qualifier: null,
            avg_stress: null,
            resting_heart_rate: spec.ruhepuls ?? null,
          },
    stress: null,
    body_battery: null,
    training_readiness:
      spec.bereitschaft === undefined
        ? null
        : [
            {
              time: `${date}T06:37`,
              score: spec.bereitschaft,
              level: null,
              feedback: null,
              trigger: "AFTER_WAKEUP_RESET",
              recovery_time_minutes: null,
              acute_load: null,
            },
          ],
    skin_temp: null,
  };
}

/**
 * Serien aus einer Folge von Tagen ab dem 01.07.2026 — bewusst über
 * `berechneSerien` statt über ein handgeschriebenes Serien-Objekt: der Index
 * rechnet auf genau der Form, die die Oberfläche ihm auch wirklich vorlegt.
 * `null` steht für einen Tag, an dem gar nichts gemessen wurde.
 */
function serienAus(tage: (TagSpec | null)[]): KoerperdatenSerien {
  const von = ERSTER_TAG;
  const bis = plusTage(von, tage.length - 1);
  const blobs = tage.flatMap((spec, i) =>
    spec === null ? [] : [blob(plusTage(von, i), spec)],
  );
  return berechneSerien(blobs, { von, bis });
}

/** Der Beitrag einer Achse aus einer Aufschlüsselung. */
function beitrag(aufschluesselung: { beitraege: Beitrag[] }, achse: Achse) {
  return aufschluesselung.beitraege.find((b) => b.achse === achse)!;
}

/** Der Index des letzten Tages der übergebenen Folge. */
function letzterTagesindex(tage: (TagSpec | null)[]): Tagesindex {
  const serien = serienAus(tage);
  return berechneTagesindex(serien, serien.tage.length - 1);
}

describe("HRV-Achse", () => {
  it("gibt einem Nachtwert in der Mitte des eigenen Bands 85 Punkte", () => {
    const heute = letzterTagesindex([{ hrv: 40, band: [35, 45] }]);

    expect(beitrag(heute, "hrv").punkte).toBe(85);
  });

  it("deckelt einen Nachtwert oberhalb des Bands bei 100 Punkten", () => {
    const knappDarueber = letzterTagesindex([{ hrv: 46, band: [35, 45] }]);
    const weitDarueber = letzterTagesindex([{ hrv: 80, band: [35, 45] }]);

    expect(beitrag(knappDarueber, "hrv").punkte).toBe(100);
    expect(beitrag(weitDarueber, "hrv").punkte).toBe(100);
  });

  it("lässt einen Nachtwert unterhalb der unteren Grenze linear fallen", () => {
    // Band 35–45, also 10 ms breit: an der Grenze 70 Punkte, eine ganze
    // Bandbreite darunter 0 — dazwischen gerade Linie.
    const anDerGrenze = letzterTagesindex([{ hrv: 35, band: [35, 45] }]);
    const halbeBreiteDarunter = letzterTagesindex([{ hrv: 30, band: [35, 45] }]);
    const volleBreiteDarunter = letzterTagesindex([{ hrv: 25, band: [35, 45] }]);

    expect(beitrag(anDerGrenze, "hrv").punkte).toBe(70);
    expect(beitrag(halbeBreiteDarunter, "hrv").punkte).toBe(35);
    expect(beitrag(volleBreiteDarunter, "hrv").punkte).toBe(0);
  });

  it("deckelt einen Nachtwert weit unterhalb des Bands bei 0 Punkten", () => {
    const heute = letzterTagesindex([{ hrv: 12, band: [35, 45] }]);

    expect(beitrag(heute, "hrv").punkte).toBe(0);
  });

  it("lässt die Achse ohne Baseline-Band eine Lücke sein, auch mit Nachtwert", () => {
    // Ein HRV-Wert ohne den eigenen Korridor hat keine Position — und ohne
    // Position keine Punkte.
    const heute = letzterTagesindex([{ hrv: 40 }]);

    expect(beitrag(heute, "hrv").punkte).toBeNull();
  });
});

describe("Schlaf-Achse", () => {
  it("übernimmt Garmins Schlafscore als Punkte", () => {
    const heute = letzterTagesindex([{ schlaf: 78 }]);

    expect(beitrag(heute, "schlaf").punkte).toBe(78);
  });

  it("lässt einen Tag ohne Schlafscore eine Lücke sein", () => {
    const heute = letzterTagesindex([{ hrv: 40, band: [35, 45] }]);

    expect(beitrag(heute, "schlaf").punkte).toBeNull();
  });
});

describe("Bereitschafts-Achse", () => {
  it("übernimmt den Morgenwert der Training Readiness als Punkte", () => {
    const heute = letzterTagesindex([{ bereitschaft: 64 }]);

    expect(beitrag(heute, "bereitschaft").punkte).toBe(64);
  });

  it("lässt einen Tag ohne Morgenwert eine Lücke sein", () => {
    const heute = letzterTagesindex([{ schlaf: 78 }]);

    expect(beitrag(heute, "bereitschaft").punkte).toBeNull();
  });
});

describe("Ruhepuls-Achse", () => {
  /** Eine Folge von Tagen, an denen nur der Ruhepuls gemessen wurde. */
  function ruhepulsTage(...werte: number[]): TagSpec[] {
    return werte.map((ruhepuls) => ({ ruhepuls }));
  }

  it("gibt einem Ruhepuls auf oder unter dem eigenen Median volle Punkte", () => {
    const aufDemMedian = letzterTagesindex(ruhepulsTage(50, 50, 50, 50, 50));
    const darunter = letzterTagesindex(ruhepulsTage(50, 50, 50, 50, 44));

    expect(beitrag(aufDemMedian, "ruhepuls").punkte).toBe(100);
    expect(beitrag(darunter, "ruhepuls").punkte).toBe(100);
  });

  it("gibt einem Ruhepuls fünf Schläge über dem Median keine Punkte mehr", () => {
    const fuenfDarueber = letzterTagesindex(ruhepulsTage(50, 50, 50, 50, 55));
    const weitDarueber = letzterTagesindex(ruhepulsTage(50, 50, 50, 50, 62));

    expect(beitrag(fuenfDarueber, "ruhepuls").punkte).toBe(0);
    expect(beitrag(weitDarueber, "ruhepuls").punkte).toBe(0);
  });

  it("fällt zwischen Median und fünf Schlägen darüber linear", () => {
    const zweiDarueber = letzterTagesindex(ruhepulsTage(50, 50, 50, 50, 52));

    expect(beitrag(zweiDarueber, "ruhepuls").punkte).toBe(60);
  });

  it("bildet den Median über die letzten 28 Tage, nicht über den ganzen Verlauf", () => {
    // Wer sich über einen Block hinweg auf ein neues Niveau bewegt, soll daran
    // gemessen werden und nicht am Ruhepuls von vor zwei Monaten.
    const heute = letzterTagesindex([
      ...ruhepulsTage(...Array<number>(20).fill(50)),
      ...ruhepulsTage(...Array<number>(20).fill(60)),
    ]);

    // Im 28-Tage-Fenster überwiegen die 60er klar — der heutige 60er liegt damit
    // auf dem Median. Über den ganzen Verlauf gerechnet läge der Median bei 55
    // und der Tag bei 0 Punkten.
    expect(beitrag(heute, "ruhepuls").punkte).toBe(100);
  });

  it("kommt mit einer kürzeren Historie als 28 Tagen aus", () => {
    const dreiTage = letzterTagesindex(ruhepulsTage(48, 50, 53));
    // Median von 48, 50 und 53 ist 50 — die Abweichung sind drei Schläge.
    expect(beitrag(dreiTage, "ruhepuls").punkte).toBe(40);

    // Der allererste Tag eines Zeitraums ist sein eigener Median: keine
    // Abweichung, volle Punkte. Bewusst so — eine Lücke wäre hier irreführender,
    // weil sie den Anschein erweckte, es sei nichts gemessen worden.
    const einTag = letzterTagesindex(ruhepulsTage(53));
    expect(beitrag(einTag, "ruhepuls").punkte).toBe(100);
  });

  it("lässt einen Tag ohne gemessenen Ruhepuls eine Lücke sein", () => {
    const heute = letzterTagesindex([{ ruhepuls: 50 }, { schlaf: 78 }]);

    expect(beitrag(heute, "ruhepuls").punkte).toBeNull();
  });
});

/** Ein Tag, an dem alle vier Marker gemessen wurden — mit zwei Tagen Historie davor. */
const VOLLSTAENDIGER_TAG: (TagSpec | null)[] = [
  { ruhepuls: 50 },
  { ruhepuls: 50 },
  { hrv: 41, band: [35, 45], schlaf: 78, ruhepuls: 52, bereitschaft: 64 },
];

describe("Gewichtung", () => {
  it("gewichtet die vier Achsen mit 35, 25, 20 und 20 Prozent", () => {
    const heute = letzterTagesindex(VOLLSTAENDIGER_TAG);

    expect(heute.beitraege.map((b) => [b.achse, b.gewicht])).toEqual([
      ["hrv", 0.35],
      ["schlaf", 0.25],
      ["ruhepuls", 0.2],
      ["bereitschaft", 0.2],
    ]);
  });

  it("summiert die Beiträge zum Index", () => {
    const heute = letzterTagesindex(VOLLSTAENDIGER_TAG);

    // 88 Punkte HRV (oberes Drittel des Bands), 78 Schlaf, 60 Ruhepuls (zwei
    // Schläge über dem eigenen Median), 64 Bereitschaft.
    expect(heute.beitraege.map((b) => [b.punkte, b.beitrag])).toEqual([
      [88, 30.8],
      [78, 19.5],
      [60, 12],
      [64, 12.8],
    ]);
    expect(heute.index).toBe(75.1);

    const summe = heute.beitraege.reduce((s, b) => s + (b.beitrag ?? 0), 0);
    expect(summe).toBeCloseTo(heute.index!, 1);
  });
});

describe("Renormalisierung bei fehlender Achse", () => {
  /**
   * Ein Tag, an dem jede vorhandene Achse volle 100 Punkte ergibt — dadurch muss
   * auch der Index 100 sein, sobald die Gewichte richtig renormalisiert werden.
   */
  function volleTage(ohne: Achse[]): (TagSpec | null)[] {
    const spec: TagSpec = {
      hrv: 45,
      band: [35, 45],
      schlaf: 100,
      ruhepuls: 50,
      bereitschaft: 100,
    };
    if (ohne.includes("hrv")) delete spec.hrv, delete spec.band;
    if (ohne.includes("schlaf")) delete spec.schlaf;
    if (ohne.includes("ruhepuls")) delete spec.ruhepuls;
    if (ohne.includes("bereitschaft")) delete spec.bereitschaft;
    return [spec];
  }

  it.each(ACHSEN)(
    "verteilt das Gewicht der fehlenden Achse %s auf die übrigen",
    (fehlend) => {
      const heute = letzterTagesindex(volleTage([fehlend]));

      expect(beitrag(heute, fehlend).punkte).toBeNull();
      expect(beitrag(heute, fehlend).gewicht).toBe(0);
      expect(beitrag(heute, fehlend).beitrag).toBeNull();

      const gewichte = heute.beitraege.reduce((s, b) => s + b.gewicht, 0);
      expect(gewichte).toBeCloseTo(1, 3);
      expect(heute.index).toBe(100);
    },
  );

  it("behält das Verhältnis der übrigen Gewichte bei", () => {
    // Ohne Bereitschaft bleiben 80 % übrig: 35/80, 25/80 und 20/80.
    const heute = letzterTagesindex(volleTage(["bereitschaft"]));

    expect(heute.beitraege.map((b) => b.gewicht)).toEqual([
      0.4375, 0.3125, 0.25, 0,
    ]);
  });

  it("rechnet auch mit genau zwei fehlenden Achsen noch einen Index", () => {
    const heute = letzterTagesindex(volleTage(["hrv", "ruhepuls"]));

    // Übrig bleiben Schlaf (25 %) und Bereitschaft (20 %) — im Verhältnis 25:20.
    expect(heute.index).toBe(100);
    expect(heute.beitraege.map((b) => b.gewicht)).toEqual([
      0, 0.5556, 0, 0.4444,
    ]);
  });
});

describe("Lücke statt Schätzung", () => {
  it("rechnet bei mehr als zwei fehlenden Achsen gar keinen Index", () => {
    const nurSchlaf = letzterTagesindex([{ schlaf: 78 }]);

    expect(nurSchlaf.index).toBeNull();
  });

  it("weist die gemessenen Marker auch ohne Index noch aus", () => {
    // Der Athlet soll sehen, dass gemessen wurde — nur eben nicht genug für eine
    // Gesamtzahl. Ein Gewicht tragen die Achsen dann nicht.
    const nurSchlaf = letzterTagesindex([{ schlaf: 78 }]);

    expect(beitrag(nurSchlaf, "schlaf").punkte).toBe(78);
    expect(nurSchlaf.beitraege.every((b) => b.gewicht === 0)).toBe(true);
    expect(nurSchlaf.beitraege.every((b) => b.beitrag === null)).toBe(true);
  });

  it("rechnet an einem Tag ganz ohne Messung keinen Index", () => {
    const ohneMessung = letzterTagesindex([{ schlaf: 78 }, null]);

    expect(ohneMessung.index).toBeNull();
    expect(ohneMessung.beitraege.every((b) => b.punkte === null)).toBe(true);
  });
});

describe("berechneIndex", () => {
  /**
   * Ein Tag mit allen vier Markern, dessen Index sich einfach nachrechnen lässt:
   * HRV und Ruhepuls geben volle Punkte, Schlaf und Bereitschaft je `n`.
   * Index = 35 + 20 + 0,45 × n.
   */
  const voll = (n: number): TagSpec => ({
    hrv: 45,
    band: [35, 45],
    schlaf: n,
    ruhepuls: 50,
    bereitschaft: n,
  });

  it("liefert einen Index je Tag der Achse, mit Lücken an Tagen ohne Index", () => {
    const { serie } = berechneIndex(serienAus([voll(80), voll(60), { schlaf: 78 }]));

    expect(serie).toEqual([91, 82, null]);
  });

  it("nimmt als aktuellen Stand den jüngsten Tag mit Index", () => {
    // Der letzte Tag der Achse hat keinen Index — die Kachel soll trotzdem den
    // letzten bekannten Stand zeigen und nicht leer bleiben.
    const { aktuell } = berechneIndex(
      serienAus([voll(80), voll(60), { schlaf: 78 }]),
    );

    expect(aktuell.tag).toBe("2026-07-02");
    expect(aktuell.wert).toBe(82);
    expect(aktuell.schnitt_7).toBe(86.5);
    expect(aktuell.delta).toBe(-4.5);
    expect(aktuell.beitraege.map((b) => b.beitrag)).toEqual([35, 15, 20, 12]);
  });

  it("zeigt am Ende eines Zeitraums ganz ohne Index die Marker des letzten Tages", () => {
    const { serie, aktuell } = berechneIndex(serienAus([{ schlaf: 78 }]));

    expect(serie).toEqual([null]);
    expect(aktuell.tag).toBe("2026-07-01");
    expect(aktuell.wert).toBeNull();
    expect(aktuell.delta).toBeNull();
    expect(beitrag(aktuell, "schlaf").punkte).toBe(78);
  });

  it("liefert für einen leeren Zeitraum eine leere Serie", () => {
    const { serie, aktuell } = berechneIndex(serienAus([]));

    expect(serie).toEqual([]);
    expect(aktuell.tag).toBeNull();
    expect(aktuell.wert).toBeNull();
  });
});
