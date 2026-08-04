import { describe, it, expect } from "vitest";
import { isValidKw } from "../steuerung/steuerungStore.js";
import { isoWoche } from "./isoWoche.js";

/** Jeder Kalendertag von `von` bis `bis` (inklusive). */
function tageVon(von: string, bis: string): string[] {
  const tage: string[] = [];
  for (const d = new Date(`${von}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const tag = d.toISOString().slice(0, 10);
    if (tag > bis) return tage;
    tage.push(tag);
  }
}

describe("isoWoche", () => {
  it("bildet einen Tag mitten im Jahr auf seine Kalenderwoche ab", () => {
    expect(isoWoche("2026-06-13")).toBe("2026-W24");
  });

  // Die Woche läuft von Montag bis Sonntag: alle sieben Tage tragen denselben
  // Schlüssel, der Montag danach einen neuen. Sonst landete ein Sonntagslauf im
  // Wocheneintrag der Folgewoche.
  it("gibt allen Tagen von Montag bis Sonntag denselben Schlüssel", () => {
    const woche = [
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ];

    expect(woche.map(isoWoche)).toEqual(woche.map(() => "2026-W24"));
    expect(isoWoche("2026-06-15")).toBe("2026-W25");
  });

  // Der klassische Fehlerfall: ein Januartag trägt nicht zwingend das Jahr seines
  // Kalenders. Wer hier das Kalenderjahr nimmt, schreibt einen Tag in eine Woche
  // „2021-W53", die es im Store nie geben wird.
  it("ordnet einen 1. Januar der letzten Woche des Vorjahres zu, wenn er dort liegt", () => {
    expect(isoWoche("2021-01-01")).toBe("2020-W53");
    expect(isoWoche("2005-01-01")).toBe("2004-W53");
    expect(isoWoche("2016-01-03")).toBe("2015-W53");
  });

  // Und dieselbe Grenze von der anderen Seite: die letzten Dezembertage gehören
  // schon zur ersten Woche des Folgejahres.
  it("ordnet Dezembertage der ersten Woche des Folgejahres zu, wenn sie dort liegen", () => {
    expect(isoWoche("2019-12-30")).toBe("2020-W01");
    expect(isoWoche("2024-12-30")).toBe("2025-W01");
  });

  // Die Wochen um den 1. Januar herum, Tag für Tag: der Sprung ins neue
  // Wochen-Jahr passiert am Montag, nicht am Neujahrstag.
  it("führt die Wochen um den 1. Januar herum lückenlos über den Jahreswechsel", () => {
    expect(isoWoche("2019-12-29")).toBe("2019-W52");
    expect(isoWoche("2019-12-31")).toBe("2020-W01");
    expect(isoWoche("2020-01-01")).toBe("2020-W01");
    expect(isoWoche("2020-01-05")).toBe("2020-W01");
    expect(isoWoche("2020-01-06")).toBe("2020-W02");

    expect(isoWoche("2020-12-31")).toBe("2020-W53");
    expect(isoWoche("2021-01-03")).toBe("2020-W53");
    expect(isoWoche("2021-01-04")).toBe("2021-W01");
  });

  // Ein 1. Januar, der selbst schon Woche 1 ist — der andere Ausgang derselben
  // Verzweigung.
  it("gibt einem 1. Januar die Woche 1, wenn er dort liegt", () => {
    expect(isoWoche("2026-01-01")).toBe("2026-W01");
  });

  // Jahre mit 53 Wochen kommen vor; die 53 abzuschneiden würde einen Tag still
  // in die Woche davor legen.
  it("kennt die 53. Woche", () => {
    expect(isoWoche("2027-01-03")).toBe("2026-W53");
  });

  // Der Zweck des Moduls: der Schlüssel muss beim Steuerungs-Store durchgehen.
  // Geprüft gegen dessen eigene Invariante (isValidKw, ^\d{4}-W\d{2}$) statt gegen
  // eine hier abgeschriebene Kopie davon — eine Kopie könnte auseinanderlaufen,
  // und ein einstelliges „2026-W7" flöge erst zur Laufzeit auf.
  it("liefert über Jahre hinweg nur Schlüssel, die der Steuerungs-Store annimmt", () => {
    const ungueltig = tageVon("2019-12-01", "2027-01-31")
      .map(isoWoche)
      .filter((kw) => !isValidKw(kw));

    expect(ungueltig).toEqual([]);
  });

  // Ein Datum, das kein Datum ist, darf nicht als Schlüssel durchrutschen: ein
  // stiller „NaN-WNaN" verbände einen Tag mit gar keinem oder — schlimmer — mit
  // dem falschen Wocheneintrag. Lieber sofort laut.
  it("wirft bei einem Datum, das keines ist", () => {
    expect(() => isoWoche("13.06.2026")).toThrow();
    expect(() => isoWoche("2026-13-45")).toThrow();
    expect(() => isoWoche("")).toThrow();
  });
});
