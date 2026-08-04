import { describe, it, expect } from "vitest";

import type { Koerperdaten } from "./formatKoerperdaten.js";
import {
  LUECKEN_FENSTER_TAGE,
  NACHREICH_FENSTER_TAGE,
  addDays,
  fensterStart,
  nachzuholendeTage,
} from "./koerperdatenNachlauf.js";

const HEUTE = "2026-08-04";

/** Eine Zeile mit Messwerten — der Normalfall eines archivierten Tages. */
function zeile(date: string): Koerperdaten {
  return {
    date,
    hrv: {
      status: "BALANCED",
      last_night_avg: 62,
      weekly_avg: 60,
      baseline_low: 50,
      baseline_high: 70,
    },
    sleep: null,
    stress: null,
    body_battery: null,
    training_readiness: null,
    skin_temp: null,
  };
}

/** Eine Zeile ohne jeden Messwert — Garmin hatte für den Tag nichts. */
function leereZeile(date: string): Koerperdaten {
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

/** Alle Tage des Fensters bis gestern, als volle Zeilen. */
function vollesFenster(heute: string): Koerperdaten[] {
  const zeilen: Koerperdaten[] = [];
  for (let i = LUECKEN_FENSTER_TAGE; i >= 1; i--) {
    zeilen.push(zeile(addDays(heute, -i)));
  }
  return zeilen;
}

describe("nachzuholendeTage", () => {
  it("holt im Normalbetrieb nur gestern", () => {
    expect(nachzuholendeTage({ vorhanden: vollesFenster(HEUTE), heute: HEUTE })).toEqual(
      ["2026-08-03"],
    );
  });

  it("holt gestern auch dann, wenn dafür schon eine Zeile im Archiv steht", () => {
    // Ein Read-through kann tagsüber einen Zwischenstand geschrieben haben; der
    // Cron am Morgen danach schreibt den endgültigen Stand (ADR-0002).
    const nachzuholen = nachzuholendeTage({
      vorhanden: vollesFenster(HEUTE),
      heute: HEUTE,
    });
    expect(nachzuholen).toContain("2026-08-03");
  });

  it("holt heute nie — der Tag läuft noch", () => {
    expect(nachzuholendeTage({ vorhanden: [], heute: HEUTE })).not.toContain(HEUTE);
  });

  it("schließt eine Lücke, die Tage zurückliegt", () => {
    const vorhanden = vollesFenster(HEUTE).filter((z) => z.date !== "2026-07-29");
    expect(nachzuholendeTage({ vorhanden, heute: HEUTE })).toEqual([
      "2026-07-29",
      "2026-08-03",
    ]);
  });

  it("holt bei leerem Archiv das ganze Fenster bis gestern", () => {
    const nachzuholen = nachzuholendeTage({ vorhanden: [], heute: HEUTE });
    expect(nachzuholen).toHaveLength(LUECKEN_FENSTER_TAGE);
    expect(nachzuholen[0]).toBe(fensterStart(HEUTE));
    expect(nachzuholen[nachzuholen.length - 1]).toBe("2026-08-03");
  });

  it("greift nicht über das Fenster hinaus", () => {
    const zuAlt = addDays(HEUTE, -(LUECKEN_FENSTER_TAGE + 1));
    const vorhanden = vollesFenster(HEUTE);
    expect(nachzuholendeTage({ vorhanden, heute: HEUTE })).not.toContain(zuAlt);
  });

  it("fragt einen leeren Tag im Nachreich-Fenster erneut an", () => {
    const spaet = addDays(HEUTE, -NACHREICH_FENSTER_TAGE);
    const vorhanden = vollesFenster(HEUTE).map((z) =>
      z.date === spaet ? leereZeile(spaet) : z,
    );
    expect(nachzuholendeTage({ vorhanden, heute: HEUTE })).toContain(spaet);
  });

  it("glaubt einem leeren Tag jenseits des Nachreich-Fensters", () => {
    // Sonst würde eine uhrfreie Urlaubswoche jeden Cron-Lauf neu abgefragt.
    const alt = addDays(HEUTE, -(NACHREICH_FENSTER_TAGE + 1));
    const vorhanden = vollesFenster(HEUTE).map((z) =>
      z.date === alt ? leereZeile(alt) : z,
    );
    expect(nachzuholendeTage({ vorhanden, heute: HEUTE })).not.toContain(alt);
  });

  it("liefert aufsteigend sortiert, unabhängig von der Reihenfolge der Zeilen", () => {
    const vorhanden = vollesFenster(HEUTE)
      .filter((z) => z.date !== "2026-07-26" && z.date !== "2026-08-01")
      .reverse();
    expect(nachzuholendeTage({ vorhanden, heute: HEUTE })).toEqual([
      "2026-07-26",
      "2026-08-01",
      "2026-08-03",
    ]);
  });

  it("rechnet über Monatsgrenzen hinweg", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(nachzuholendeTage({ vorhanden: [], heute: "2026-03-01" })[0]).toBe(
      "2026-02-15",
    );
  });
});
