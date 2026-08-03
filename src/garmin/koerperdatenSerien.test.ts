import { describe, it, expect } from "vitest";
import type { Koerperdaten } from "./formatKoerperdaten.js";
import {
  berechneSerien,
  kalendertage,
  letzteTage,
  rollierendesMittel,
} from "./koerperdatenSerien.js";

/**
 * Ein archivierter Tag mit HRV-Block. Bewusst handgeschrieben statt aus einer
 * Fixture: hier interessiert nicht die Garmin-Rohform (die deckt
 * formatKoerperdaten.test.ts ab), sondern der Weg vom Tagesblob zur Serie.
 */
function tagMitHrv(
  date: string,
  hrv: Partial<NonNullable<Koerperdaten["hrv"]>>,
): Koerperdaten {
  return {
    date,
    hrv: {
      status: "BALANCED",
      last_night_avg: null,
      weekly_avg: null,
      baseline_low: null,
      baseline_high: null,
      ...hrv,
    },
    sleep: null,
    stress: null,
    body_battery: null,
    training_readiness: null,
    skin_temp: null,
  };
}

/** Ein Tag im Archiv, an dem die Uhr keine HRV gemessen hat. */
function tagOhneHrv(date: string): Koerperdaten {
  return {
    date,
    hrv: null,
    sleep: null,
    stress: null,
    body_battery: null,
    training_readiness: null,
    skin_temp: null,
  };
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

    expect(serien).toEqual({
      tage: ["2026-07-01", "2026-07-02", "2026-07-03"],
      hrv: {
        nachtwert: [37, 41, 33],
        wochenschnitt: [36, 37, 37],
        band_unten: [35, 35, 36],
        band_oben: [44, 44, 45],
      },
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
