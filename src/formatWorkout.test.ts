import { describe, it, expect } from "vitest";
import { formatWorkout } from "./formatWorkout.js";

import quality from "../test/fixtures/quality-subthreshold.json";
import restDay from "../test/fixtures/rest-day.json";
import raceTermin from "../test/fixtures/race-termin.json";
import raceFlag from "../test/fixtures/race-flag.json";
import easyRegen from "../test/fixtures/easy-regen.json";

describe("formatWorkout", () => {
  it("mappt ein Qualitätstraining auf die Plan-Felder", () => {
    const result = formatWorkout(quality as any);

    expect(result).toEqual({
      date: "2026-05-08",
      name: "Subthreshold + Speedwork",
      description:
        "15min Einlaufen + \n\n3x2k Subthreshhold with 75s rest + 8x300m in 5k Pace \n\n15min auslaufen\n\nSubthreshold: ca. 92% von LT2 Pace",
      sport: "Laufen",
      focus: "Subthreshold",
      rest_day: false,
      is_race: false,
    });
  });

  it("markiert einen Ruhetag und ersetzt fehlenden Titel durch leeren String", () => {
    const result = formatWorkout(restDay as any);

    expect(result.sport).toBe("Ruhetag");
    expect(result.rest_day).toBe(true);
    expect(result.name).toBe("");
    expect(result.focus).toBeNull();
  });

  it("erkennt einen Wettkampf am Fokus 'Termin', auch ohne is_race-Flag", () => {
    const result = formatWorkout(raceTermin as any);

    expect((raceTermin as any).is_race).toBe(false);
    expect(result.sport).toBe("Anderes");
    expect(result.focus).toBe("Termin");
    expect(result.is_race).toBe(true);
  });

  it("erkennt ein Rennen am is_race-Flag (Fokus Test-Race)", () => {
    const result = formatWorkout(raceFlag as any);

    expect(result.sport).toBe("Laufen");
    expect(result.focus).toBe("Test-Race");
    expect(result.is_race).toBe(true);
  });

  it("behält einen Easy Run und macht aus null-description einen leeren String", () => {
    const result = formatWorkout(easyRegen as any);

    expect(result.sport).toBe("Laufen");
    expect(result.focus).toBe("Regenerations-Lauf");
    expect(result.rest_day).toBe(false);
    expect(result.is_race).toBe(false);
    expect(result.description).toBe("");
  });

  it("strippt alle Ist-/Messdaten eines absolvierten Eintrags (ADR-0001)", () => {
    // quality-subthreshold ist bereits absolviert (has_actual_data: true) und trägt
    // Laps, HR, Pace, Power etc. in Activities[0].
    expect((quality as any).has_actual_data).toBe(true);

    const result = formatWorkout(quality as any);

    expect(Object.keys(result).sort()).toEqual([
      "date",
      "description",
      "focus",
      "is_race",
      "name",
      "rest_day",
      "sport",
    ]);

    const serialized = JSON.stringify(result);
    for (const istFeld of ["Laps", "hr_avg", "hr_max", "pace", "power_avg", "MapURL"]) {
      expect(serialized).not.toContain(istFeld);
    }
  });
});
