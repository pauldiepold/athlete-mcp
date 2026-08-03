import { describe, it, expect } from "vitest";
import type {
  Koerperdaten,
  TrainingReadinessReading,
} from "./formatKoerperdaten.js";
import {
  berechneKennzahlen,
  berechneSerien,
  kalendertage,
  letzteTage,
  rollierendesMittel,
} from "./koerperdatenSerien.js";

/**
 * Ein archivierter Tag. Bewusst handgeschrieben statt aus einer Fixture: hier
 * interessiert nicht die Garmin-Rohform (die deckt formatKoerperdaten.test.ts
 * ab), sondern der Weg vom Tagesblob zur Serie. Was der Test nicht setzt, ist
 * im Blob nicht vorhanden — also eine Lücke.
 */
function tag(
  date: string,
  bloecke: Partial<Omit<Koerperdaten, "date">> = {},
): Koerperdaten {
  return {
    date,
    hrv: null,
    sleep: null,
    stress: null,
    body_battery: null,
    training_readiness: null,
    skin_temp: null,
    ...bloecke,
  };
}

/** Ein einzelnes Training-Readiness-Reading; ungesetzte Felder bleiben leer. */
function reading(
  felder: Partial<TrainingReadinessReading>,
): TrainingReadinessReading {
  return {
    time: null,
    score: null,
    level: null,
    feedback: null,
    trigger: null,
    recovery_time_minutes: null,
    acute_load: null,
    ...felder,
  };
}

/** Ein archivierter Tag mit HRV-Block. */
function tagMitHrv(
  date: string,
  hrv: Partial<NonNullable<Koerperdaten["hrv"]>>,
): Koerperdaten {
  return tag(date, {
    hrv: {
      status: "BALANCED",
      last_night_avg: null,
      weekly_avg: null,
      baseline_low: null,
      baseline_high: null,
      ...hrv,
    },
  });
}

/** Ein archivierter Tag mit Schlaf-Block. */
function tagMitSchlaf(
  date: string,
  sleep: Partial<NonNullable<Koerperdaten["sleep"]>>,
): Koerperdaten {
  return tag(date, {
    sleep: {
      duration_seconds: null,
      deep_seconds: null,
      light_seconds: null,
      rem_seconds: null,
      awake_seconds: null,
      score: null,
      score_qualifier: null,
      avg_stress: null,
      resting_heart_rate: null,
      ...sleep,
    },
  });
}

/** Ein Tag im Archiv, an dem die Uhr keine HRV gemessen hat. */
function tagOhneHrv(date: string): Koerperdaten {
  return tag(date);
}

describe("berechneSerien", () => {
  it("legt die HRV-Serien auf die Kalender-Achse des Zeitraums", () => {
    const serien = berechneSerien(
      [
        tagMitHrv("2026-07-01", {
          last_night_avg: 37,
          weekly_avg: 36,
          baseline_low: 35,
          baseline_high: 44,
        }),
        tagMitHrv("2026-07-02", {
          last_night_avg: 41,
          weekly_avg: 37,
          baseline_low: 35,
          baseline_high: 44,
        }),
        tagMitHrv("2026-07-03", {
          last_night_avg: 33,
          weekly_avg: 37,
          baseline_low: 36,
          baseline_high: 45,
        }),
      ],
      { von: "2026-07-01", bis: "2026-07-03" },
    );

    expect(serien.tage).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(serien.hrv).toEqual({
      nachtwert: [37, 41, 33],
      wochenschnitt: [36, 37, 37],
      band_unten: [35, 35, 36],
      band_oben: [44, 44, 45],
    });
  });

  it("lässt fehlende Tage als Lücke stehen, statt die Achse zusammenzuschieben", () => {
    const serien = berechneSerien(
      [
        tagMitHrv("2026-07-01", { last_night_avg: 37 }),
        // 02. und 03. fehlen im Archiv (Uhr nicht getragen)
        tagMitHrv("2026-07-04", { last_night_avg: 33 }),
      ],
      { von: "2026-07-01", bis: "2026-07-04" },
    );

    expect(serien.tage).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ]);
    expect(serien.hrv.nachtwert).toEqual([37, null, null, 33]);
  });

  it("macht aus einem archivierten Tag ohne HRV-Block eine Lücke", () => {
    const serien = berechneSerien(
      [
        tagMitHrv("2026-07-01", { last_night_avg: 37, baseline_low: 35 }),
        tagOhneHrv("2026-07-02"),
      ],
      { von: "2026-07-01", bis: "2026-07-02" },
    );

    expect(serien.hrv.nachtwert).toEqual([37, null]);
    expect(serien.hrv.band_unten).toEqual([35, null]);
  });

  it("liefert für einen Zeitraum ohne archivierte Tage durchgehend Lücken", () => {
    const serien = berechneSerien([], { von: "2026-07-01", bis: "2026-07-03" });

    expect(serien.tage).toHaveLength(3);
    expect(serien.hrv.nachtwert).toEqual([null, null, null]);
    expect(serien.hrv.wochenschnitt).toEqual([null, null, null]);
    expect(serien.hrv.band_unten).toEqual([null, null, null]);
    expect(serien.hrv.band_oben).toEqual([null, null, null]);
  });

  it("liefert leere Serien, wenn der Zeitraum selbst leer ist", () => {
    const serien = berechneSerien([tagMitHrv("2026-07-01", { last_night_avg: 37 })], {
      von: "2026-07-02",
      bis: "2026-07-01",
    });

    expect(serien.tage).toEqual([]);
    expect(serien.hrv.nachtwert).toEqual([]);
  });

  it("ignoriert archivierte Tage außerhalb des Zeitraums", () => {
    const serien = berechneSerien(
      [
        tagMitHrv("2026-06-30", { last_night_avg: 99 }),
        tagMitHrv("2026-07-01", { last_night_avg: 37 }),
      ],
      { von: "2026-07-01", bis: "2026-07-01" },
    );

    expect(serien.hrv.nachtwert).toEqual([37]);
  });

  it("hält alle Serien auf gleicher Länge, auch über einen Monatswechsel", () => {
    const serien = berechneSerien([], { von: "2026-01-30", bis: "2026-02-02" });

    expect(serien.tage).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });
});

describe("Morgenwert der Training Readiness", () => {
  it("nimmt den Score des Readings mit dem Auslöser AFTER_WAKEUP_RESET", () => {
    const serien = berechneSerien(
      [
        tag("2026-07-01", {
          training_readiness: [
            reading({
              time: "2026-07-01T06:37",
              score: 85,
              trigger: "AFTER_WAKEUP_RESET",
            }),
            reading({
              time: "2026-07-01T17:22",
              score: 70,
              trigger: "AFTER_POST_EXERCISE_RESET",
            }),
          ],
        }),
      ],
      { von: "2026-07-01", bis: "2026-07-01" },
    );

    expect(serien.bereitschaft.morgenwert).toEqual([85]);
  });

  it("lässt einen Tag nur mit Post-Exercise-Readings als Lücke stehen", () => {
    const serien = berechneSerien(
      [
        tag("2026-07-01", {
          training_readiness: [
            reading({
              time: "2026-07-01T17:22",
              score: 70,
              trigger: "AFTER_POST_EXERCISE_RESET",
            }),
            reading({
              time: "2026-07-01T20:05",
              score: 64,
              trigger: "UPDATE_REALTIME_VARIABLES",
            }),
          ],
        }),
      ],
      { von: "2026-07-01", bis: "2026-07-01" },
    );

    expect(serien.bereitschaft.morgenwert).toEqual([null]);
  });

  it("lässt Readings ohne Auslöser als Lücke stehen, statt das früheste zu nehmen", () => {
    const serien = berechneSerien(
      [
        // Ältere Readings tragen gar kein inputContext (→ trigger: null). Was sie
        // waren, ist nicht mehr feststellbar — also kein Morgenwert.
        tag("2024-03-04", {
          training_readiness: [
            reading({ time: "2024-03-04T05:58", score: 88 }),
            reading({ time: "2024-03-04T19:12", score: 61 }),
          ],
        }),
      ],
      { von: "2024-03-04", bis: "2024-03-04" },
    );

    expect(serien.bereitschaft.morgenwert).toEqual([null]);
  });

  it("lässt einen Tag ganz ohne Readings als Lücke stehen", () => {
    const serien = berechneSerien([tag("2026-07-01")], {
      von: "2026-07-01",
      bis: "2026-07-01",
    });

    expect(serien.bereitschaft.morgenwert).toEqual([null]);
  });
});

describe("akute Last", () => {
  it("nimmt den Tagesendstand — die akute Last des spätesten Readings", () => {
    const serien = berechneSerien(
      [
        tag("2026-07-01", {
          training_readiness: [
            reading({
              time: "2026-07-01T06:37",
              acute_load: 436,
              trigger: "AFTER_WAKEUP_RESET",
            }),
            reading({
              time: "2026-07-01T17:22",
              acute_load: 502,
              trigger: "AFTER_POST_EXERCISE_RESET",
            }),
          ],
        }),
      ],
      { von: "2026-07-01", bis: "2026-07-01" },
    );

    expect(serien.bereitschaft.akute_last).toEqual([502]);
  });

  it("nimmt das späteste Reading auch dann, wenn die Liste unsortiert ankommt", () => {
    const serien = berechneSerien(
      [
        tag("2026-07-01", {
          training_readiness: [
            reading({ time: "2026-07-01T17:22", acute_load: 502 }),
            reading({ time: "2026-07-01T06:37", acute_load: 436 }),
          ],
        }),
      ],
      { von: "2026-07-01", bis: "2026-07-01" },
    );

    expect(serien.bereitschaft.akute_last).toEqual([502]);
  });
});

describe("Schlaf", () => {
  it("rechnet Phasen und Gesamtdauer aus Sekunden in Stunden um", () => {
    const serien = berechneSerien(
      [
        tag("2026-07-01", {
          sleep: {
            duration_seconds: 25380,
            deep_seconds: 4620,
            light_seconds: 15600,
            rem_seconds: 5160,
            awake_seconds: 720,
            score: 77,
            score_qualifier: "FAIR",
            avg_stress: 28,
            resting_heart_rate: 47,
          },
        }),
      ],
      { von: "2026-07-01", bis: "2026-07-01" },
    );

    expect(serien.schlaf.gesamt_stunden).toEqual([7.05]);
    expect(serien.schlaf.tief_stunden).toEqual([1.28]);
    expect(serien.schlaf.leicht_stunden).toEqual([4.33]);
    expect(serien.schlaf.rem_stunden).toEqual([1.43]);
    expect(serien.schlaf.wach_stunden).toEqual([0.2]);
    expect(serien.schlaf.score).toEqual([77]);
  });

  it("macht aus einer Nacht ohne Schlaf-Block durchgehend Lücken", () => {
    const serien = berechneSerien([tag("2026-07-01")], {
      von: "2026-07-01",
      bis: "2026-07-01",
    });

    expect(serien.schlaf.gesamt_stunden).toEqual([null]);
    expect(serien.schlaf.tief_stunden).toEqual([null]);
    expect(serien.schlaf.score).toEqual([null]);
  });

  it("führt das Sieben-Tage-Mittel der Gesamtdauer mit, ohne über Lücken zu interpolieren", () => {
    const naechte = [8, 6, null, 7] as const;
    const serien = berechneSerien(
      naechte.flatMap((stunden, i) =>
        stunden === null
          ? []
          : [
              tagMitSchlaf(`2026-07-0${i + 1}`, {
                duration_seconds: stunden * 3600,
              }),
            ],
      ),
      { von: "2026-07-01", bis: "2026-07-04" },
    );

    expect(serien.schlaf.gesamt_stunden).toEqual([8, 6, null, 7]);
    // Die Nacht ohne Messung bleibt Lücke, und das Mittel am 04. bildet sich nur
    // über die drei tatsächlich gemessenen Nächte: (8 + 6 + 7) / 3 = 7.
    expect(serien.schlaf.gesamt_mittel_7).toEqual([8, 7, null, 7]);
  });
});

describe("Ruhepuls und Hauttemperatur-Abweichung", () => {
  it("liest den Ruhepuls aus dem Schlaf-Block", () => {
    const serien = berechneSerien(
      [tagMitSchlaf("2026-07-01", { resting_heart_rate: 47 })],
      { von: "2026-07-01", bis: "2026-07-01" },
    );

    expect(serien.ruhepuls).toEqual([47]);
  });

  it("lässt die Hauttemperatur leer, wenn die Uhr sie nicht gemessen hat — der Ruhepuls bleibt", () => {
    // data_exists: false ist der Normalfall vieler Zeilen. Die Abweichung ist
    // dann keine Null, sondern gar nicht vorhanden.
    const serien = berechneSerien(
      [
        tag("2026-07-01", {
          sleep: {
            duration_seconds: null,
            deep_seconds: null,
            light_seconds: null,
            rem_seconds: null,
            awake_seconds: null,
            score: null,
            score_qualifier: null,
            avg_stress: null,
            resting_heart_rate: 47,
          },
          skin_temp: { deviation_celsius: 0, data_exists: false },
        }),
      ],
      { von: "2026-07-01", bis: "2026-07-01" },
    );

    expect(serien.hauttemperatur_abweichung).toEqual([null]);
    expect(serien.ruhepuls).toEqual([47]);
  });

  it("übernimmt die Abweichung, wenn die Uhr sie gemessen hat", () => {
    const serien = berechneSerien(
      [
        tag("2026-07-01", {
          skin_temp: { deviation_celsius: -0.4, data_exists: true },
        }),
      ],
      { von: "2026-07-01", bis: "2026-07-01" },
    );

    expect(serien.hauttemperatur_abweichung).toEqual([-0.4]);
  });
});

describe("Stress", () => {
  it("nimmt den Tagesdurchschnitt aus dem Stress-Block", () => {
    const serien = berechneSerien(
      [tag("2026-07-01", { stress: { avg: 31, max: 96 } })],
      { von: "2026-07-01", bis: "2026-07-01" },
    );

    expect(serien.stress).toEqual([31]);
  });
});

describe("Body-Battery-Bilanz", () => {
  it("rechnet geladen minus verbraucht", () => {
    const serien = berechneSerien(
      [
        // Zehrtag: 43 geladen, 47 verbraucht.
        tag("2026-07-01", { body_battery: { charged: 43, drained: 47 } }),
        // Ladetag: 62 geladen, 30 verbraucht.
        tag("2026-07-02", { body_battery: { charged: 62, drained: 30 } }),
      ],
      { von: "2026-07-01", bis: "2026-07-02" },
    );

    expect(serien.body_battery.geladen).toEqual([43, 62]);
    expect(serien.body_battery.verbraucht).toEqual([47, 30]);
    expect(serien.body_battery.bilanz).toEqual([-4, 32]);
  });

  it("macht aus einer fehlenden Seite eine Lücke, statt sie als Null zu rechnen", () => {
    const serien = berechneSerien(
      [
        tag("2026-07-01", { body_battery: { charged: 43, drained: null } }),
        tag("2026-07-02"),
      ],
      { von: "2026-07-01", bis: "2026-07-02" },
    );

    expect(serien.body_battery.bilanz).toEqual([null, null]);
  });
});

describe("berechneKennzahlen", () => {
  /** Ein Zeitraum aus vier Nächten mit den gegebenen HRV-Nachtwerten. */
  function hrvUeberVierTage(nachtwerte: (number | null)[]) {
    const zeitraum = { von: "2026-07-01", bis: "2026-07-04" };
    return berechneKennzahlen(
      berechneSerien(
        nachtwerte.flatMap((wert, i) =>
          wert === null
            ? []
            : [
                tagMitHrv(`2026-07-0${i + 1}`, {
                  last_night_avg: wert,
                  baseline_low: 35,
                  baseline_high: 44,
                }),
              ],
        ),
        zeitraum,
      ),
    );
  }

  it("nimmt als aktuellen Stand den jüngsten vorhandenen Wert samt seinem Tag", () => {
    // Der 04. hat keine Messung — der aktuelle Stand ist der vom 03.
    const kennzahlen = hrvUeberVierTage([30, 40, 38, null]);

    expect(kennzahlen.hrv.wert).toBe(38);
    expect(kennzahlen.hrv.tag).toBe("2026-07-03");
  });

  it("stellt den Wert seinem Sieben-Tage-Schnitt gegenüber", () => {
    const kennzahlen = hrvUeberVierTage([30, 40, 38, null]);

    // Schnitt über die drei gemessenen Nächte bis einschließlich des 03.: 36.
    expect(kennzahlen.hrv.schnitt_7).toBe(36);
    expect(kennzahlen.hrv.delta).toBe(2);
  });

  it("überspringt beim Schnitt die Lücken, statt über sie zu interpolieren", () => {
    const kennzahlen = hrvUeberVierTage([30, null, null, 40]);

    expect(kennzahlen.hrv.wert).toBe(40);
    expect(kennzahlen.hrv.schnitt_7).toBe(35);
    expect(kennzahlen.hrv.delta).toBe(5);
  });

  it("trägt zur HRV das Baseline-Band des Tages mit, damit die Position darin ablesbar ist", () => {
    const kennzahlen = hrvUeberVierTage([30, 40, 38, null]);

    expect(kennzahlen.hrv.band_unten).toBe(35);
    expect(kennzahlen.hrv.band_oben).toBe(44);
  });

  it("liefert für einen Marker ohne einen einzigen Wert durchgehend Lücken", () => {
    const kennzahlen = hrvUeberVierTage([null, null, null, null]);

    expect(kennzahlen.hrv).toEqual({
      wert: null,
      tag: null,
      schnitt_7: null,
      delta: null,
      band_unten: null,
      band_oben: null,
    });
  });

  it("deckt alle Marker der Kachelzeile ab", () => {
    const kennzahlen = berechneKennzahlen(
      berechneSerien(
        [
          tag("2026-07-01", {
            sleep: {
              duration_seconds: 25200,
              deep_seconds: null,
              light_seconds: null,
              rem_seconds: null,
              awake_seconds: null,
              score: 77,
              score_qualifier: "FAIR",
              avg_stress: null,
              resting_heart_rate: 47,
            },
            body_battery: { charged: 62, drained: 30 },
            training_readiness: [
              reading({
                time: "2026-07-01T06:37",
                score: 85,
                acute_load: 436,
                trigger: "AFTER_WAKEUP_RESET",
              }),
            ],
          }),
        ],
        { von: "2026-07-01", bis: "2026-07-01" },
      ),
    );

    expect(kennzahlen.schlaf_stunden.wert).toBe(7);
    expect(kennzahlen.schlaf_score.wert).toBe(77);
    expect(kennzahlen.ruhepuls.wert).toBe(47);
    expect(kennzahlen.body_battery_bilanz.wert).toBe(32);
    expect(kennzahlen.bereitschaft_morgenwert.wert).toBe(85);
    expect(kennzahlen.akute_last.wert).toBe(436);
  });
});

describe("rollierendesMittel", () => {
  it("mittelt über das Fenster inklusive des Tages selbst", () => {
    expect(rollierendesMittel([10, 20, 30, 40], 3)).toEqual([10, 15, 20, 30]);
  });

  it("überspringt eine Lücke im Fenster, statt über sie zu interpolieren", () => {
    // Fenster 3 am 4. Wert: [null, 30, 40] → Mittel nur aus 30 und 40.
    expect(rollierendesMittel([10, 20, null, 30, 40], 3)).toEqual([
      10,
      15,
      null,
      25,
      35,
    ]);
  });

  it("füllt eine Lücke nicht auf — ein Tag ohne Wert bleibt ohne Wert", () => {
    expect(rollierendesMittel([10, null, 20], 7)).toEqual([10, null, 15]);
  });

  it("rundet auf eine Nachkommastelle", () => {
    expect(rollierendesMittel([10, 11, 12, 14], 3)).toEqual([10, 10.5, 11, 12.3]);
  });

  it("liefert für eine leere Serie eine leere Serie", () => {
    expect(rollierendesMittel([], 7)).toEqual([]);
  });
});

describe("letzteTage", () => {
  it("spannt den Zeitraum rückwärts vom Bezugstag auf, ihn eingeschlossen", () => {
    expect(letzteTage("2026-07-30", 30)).toEqual({
      von: "2026-07-01",
      bis: "2026-07-30",
    });
    expect(kalendertage(letzteTage("2026-07-30", 30))).toHaveLength(30);
  });

  it("rechnet über den Jahreswechsel", () => {
    expect(letzteTage("2026-01-02", 5)).toEqual({
      von: "2025-12-29",
      bis: "2026-01-02",
    });
  });
});
