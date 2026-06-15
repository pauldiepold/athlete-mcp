import { describe, it, expect } from "vitest";
import { formatKoerperdaten } from "./formatKoerperdaten.js";

import hrvVollstaendig from "./__fixtures__/vollstaendig/hrv.json";
import sleepVollstaendig from "./__fixtures__/vollstaendig/sleep.json";
import stressVollstaendig from "./__fixtures__/vollstaendig/stress.json";
import bodyBatteryVollstaendig from "./__fixtures__/vollstaendig/body-battery.json";
import trainingReadinessVollstaendig from "./__fixtures__/vollstaendig/training-readiness.json";

import hrvOhneDaten from "./__fixtures__/ohne-daten/hrv.json";
import sleepOhneDaten from "./__fixtures__/ohne-daten/sleep.json";
import stressOhneDaten from "./__fixtures__/ohne-daten/stress.json";
import bodyBatteryOhneDaten from "./__fixtures__/ohne-daten/body-battery.json";
import trainingReadinessOhneDaten from "./__fixtures__/ohne-daten/training-readiness.json";

describe("formatKoerperdaten", () => {
  it("mappt einen vollständigen Tag auf alle Körperdaten-Felder", () => {
    const result = formatKoerperdaten(
      "2026-06-13",
      hrvVollstaendig as any,
      sleepVollstaendig as any,
      stressVollstaendig as any,
      bodyBatteryVollstaendig as any,
      trainingReadinessVollstaendig as any,
    );

    expect(result).toEqual({
      date: "2026-06-13",
      hrv: {
        status: "BALANCED",
        last_night_avg: 37,
        weekly_avg: 36,
        baseline_low: 35,
        baseline_high: 44,
      },
      sleep: {
        duration_seconds: 25380,
        deep_seconds: 4620,
        light_seconds: 15600,
        rem_seconds: 5160,
        awake_seconds: 720,
        score: 77,
        score_qualifier: "FAIR",
        avg_stress: 28,
        resting_heart_rate: 58,
      },
      stress: {
        avg: 34,
        max: 90,
      },
      body_battery: {
        charged: 43,
        drained: 47,
      },
      training_readiness: {
        score: 70,
        level: "MODERATE",
        feedback: "GOOD_SLEEP_HISTORY",
      },
      skin_temp: {
        deviation_celsius: 0.3,
        data_exists: true,
      },
    });
  });

  it("liefert null für alle Felder wenn keine Daten vorhanden (Tag ohne Uhr)", () => {
    const result = formatKoerperdaten(
      "2019-01-01",
      hrvOhneDaten as any,
      sleepOhneDaten as any,
      stressOhneDaten as any,
      bodyBatteryOhneDaten as any,
      trainingReadinessOhneDaten as any,
    );

    expect(result).toEqual({
      date: "2019-01-01",
      hrv: null,
      sleep: null,
      stress: null,
      body_battery: null,
      training_readiness: null,
      skin_temp: null,
    });
  });
});
