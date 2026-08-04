import { describe, it, expect } from "vitest";
import { berechneWochenAggregate } from "./koerperdatenWochen.js";
import type { WochenEingabe } from "./koerperdatenWochen.js";

/**
 * Baut eine `WochenEingabe` aus einer Liste von Tagen. Was pro Tag nicht gesetzt
 * wird, ist eine Lücke (`null`) — dieselbe Konvention wie in koerperdatenSerien.
 */
function eingabe(
  tage: {
    tag: string;
    index?: number | null;
    hrv?: number | null;
    schlaf?: number | null;
    last?: number | null;
  }[],
): WochenEingabe {
  return {
    tage: tage.map((t) => t.tag),
    indexSerie: tage.map((t) => t.index ?? null),
    hrvNachtwert: tage.map((t) => t.hrv ?? null),
    schlafStunden: tage.map((t) => t.schlaf ?? null),
    akuteLast: tage.map((t) => t.last ?? null),
  };
}

describe("berechneWochenAggregate", () => {
  it("aggregiert eine volle Woche zu Ø Index, Ø Schlaf und Summe der akuten Last", () => {
    const wochen = berechneWochenAggregate(
      eingabe([
        { tag: "2026-06-08", index: 80, hrv: 40, schlaf: 7, last: 100 },
        { tag: "2026-06-09", index: 90, hrv: 42, schlaf: 8, last: 110 },
        { tag: "2026-06-10", index: 70, hrv: 38, schlaf: 6, last: 120 },
        { tag: "2026-06-11", index: 80, hrv: 40, schlaf: 7, last: 90 },
        { tag: "2026-06-12", index: 80, hrv: 40, schlaf: 7, last: 100 },
        { tag: "2026-06-13", index: 80, hrv: 40, schlaf: 7, last: 100 },
        { tag: "2026-06-14", index: 80, hrv: 40, schlaf: 7, last: 100 },
      ]),
      [],
    );

    expect(wochen).toHaveLength(1);
    expect(wochen[0]!.kw).toBe("2026-W24");
    expect(wochen[0]!.indexSchnitt).toBe(80);
    expect(wochen[0]!.schlafStundenSchnitt).toBe(7);
    expect(wochen[0]!.akuteLastSumme).toBe(720);
    expect(wochen[0]!.hrvSerie).toEqual([40, 42, 38, 40, 40, 40, 40]);
    expect(wochen[0]!.hatSteuerungseintrag).toBe(false);
  });

  it("zeigt eine Woche mit Körperdaten auch ohne Steuerungseintrag", () => {
    const wochen = berechneWochenAggregate(
      eingabe([{ tag: "2026-06-08", index: 80 }]),
      [],
    );

    expect(wochen).toHaveLength(1);
    expect(wochen[0]!.kw).toBe("2026-W24");
    expect(wochen[0]!.hatSteuerungseintrag).toBe(false);
    expect(wochen[0]!.indexSchnitt).toBe(80);
  });

  it("zeigt eine Woche mit Steuerungseintrag auch ganz ohne Körperdaten, mit leeren Aggregaten", () => {
    const wochen = berechneWochenAggregate(eingabe([]), ["2026-W30"]);

    expect(wochen).toEqual([
      {
        kw: "2026-W30",
        indexSchnitt: null,
        schlafStundenSchnitt: null,
        akuteLastSumme: null,
        hrvSerie: [],
        hatSteuerungseintrag: true,
      },
    ]);
  });

  it("lässt eine reine Archiv-Lücke ohne jede Spur ganz aus der Liste — sie hat weder Körperdaten noch einen Steuerungseintrag", () => {
    // Kein Tag mit Signal, keine Steuerungswoche: nichts, was in der Liste stünde.
    const wochen = berechneWochenAggregate(
      eingabe([{ tag: "2026-06-08" }]),
      [],
    );

    expect(wochen).toEqual([]);
  });

  it("aggregiert eine angebrochene, laufende Woche über nur die vorhandenen Tage, ohne sie auf sieben zu strecken", () => {
    // Die laufende Woche endet am Dienstag (dem heutigen Tag) — nur drei Tage
    // sind überhaupt Teil der Achse, keine erfundenen Tage danach.
    const wochen = berechneWochenAggregate(
      eingabe([
        { tag: "2026-06-08", index: 90, schlaf: 8, last: 100 },
        { tag: "2026-06-09", index: 80, schlaf: 7, last: 100 },
        { tag: "2026-06-10", index: 70, schlaf: 6, last: 100 },
      ]),
      [],
    );

    expect(wochen).toHaveLength(1);
    expect(wochen[0]!.indexSchnitt).toBe(80);
    expect(wochen[0]!.schlafStundenSchnitt).toBe(7);
    expect(wochen[0]!.akuteLastSumme).toBe(300);
    expect(wochen[0]!.hrvSerie).toHaveLength(3);
  });

  it("mittelt nur über die Tage mit Wert, statt Lücken als Null zu zählen und die Woche stillschweigend nach unten zu ziehen", () => {
    const wochen = berechneWochenAggregate(
      eingabe([
        { tag: "2026-06-08", index: 100 },
        { tag: "2026-06-09" }, // Lücke: Uhr nicht getragen
        { tag: "2026-06-10", index: 100 },
        { tag: "2026-06-11" }, // Lücke
        { tag: "2026-06-12", index: 100 },
        { tag: "2026-06-13" }, // Lücke
        { tag: "2026-06-14", index: 100 },
      ]),
      [],
    );

    // Vier von sieben Tagen haben einen Index, alle mit 100 — der Schnitt bleibt
    // 100, nicht 4/7 · 100, wie es eine Mittelung über alle sieben Positionen
    // (mit Lücken als 0) ergäbe.
    expect(wochen[0]!.indexSchnitt).toBe(100);
  });

  it("führt eine Woche über einen Jahreswechsel zu einem einzigen Aggregat zusammen, statt sie an Silvester zu zerreißen", () => {
    // 2019-W52 bis 2019-12-29, 2020-W01 ab 2019-12-30 — dieselbe Woche liegt in
    // zwei Kalenderjahren. Wer hier das Kalenderjahr nähme, spaltete sie in zwei
    // Aggregate statt eines.
    const wochen = berechneWochenAggregate(
      eingabe([
        { tag: "2019-12-30", index: 60 },
        { tag: "2019-12-31", index: 80 },
        { tag: "2020-01-01", index: 100 },
      ]),
      [],
    );

    expect(wochen).toHaveLength(1);
    expect(wochen[0]!.kw).toBe("2020-W01");
    expect(wochen[0]!.indexSchnitt).toBe(80);
  });

  it("sortiert die verschnittenen Wochen aufsteigend, auch wenn Körperdaten- und Steuerungs-Wochen ungeordnet hereinkommen", () => {
    const wochen = berechneWochenAggregate(
      eingabe([
        { tag: "2026-07-13", index: 80 }, // 2026-W29
        { tag: "2026-06-08", index: 80 }, // 2026-W24
      ]),
      ["2026-W26", "2026-W20"],
    );

    expect(wochen.map((w) => w.kw)).toEqual([
      "2026-W20",
      "2026-W24",
      "2026-W26",
      "2026-W29",
    ]);
  });
});
