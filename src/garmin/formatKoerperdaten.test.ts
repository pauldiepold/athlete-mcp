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
        events: [
          {
            type: "SLEEP",
            start: "2026-06-12T23:17",
            duration_minutes: 435,
            impact: 41,
            feedback: "NONE",
          },
          {
            type: "ACTIVITY",
            start: "2026-06-13T08:15",
            duration_minutes: 505,
            impact: -26,
            feedback: "MAINTAINING_AEROBIC_BASE",
          },
        ],
      },
      training_readiness: [
        {
          time: "2026-06-13T06:37",
          score: 73,
          level: "MODERATE",
          feedback: "GOOD_SLEEP_HISTORY",
          trigger: "AFTER_WAKEUP_RESET",
          recovery_time_minutes: 752,
          acute_load: 436,
        },
        {
          time: "2026-06-13T17:22",
          score: 70,
          level: "MODERATE",
          feedback: "GOOD_SLEEP_HISTORY",
          trigger: "AFTER_POST_EXERCISE_RESET",
          recovery_time_minutes: 1048,
          acute_load: 502,
        },
      ],
      skin_temp: {
        deviation_celsius: 0.3,
        data_exists: true,
      },
    });
  });

  it("lässt body_battery.events weg, wenn die Antwort keine Events trägt", () => {
    const result = formatKoerperdaten(
      "2026-06-13",
      hrvVollstaendig as any,
      sleepVollstaendig as any,
      stressVollstaendig as any,
      [{ charged: 43, drained: 47 }],
      trainingReadinessVollstaendig as any,
    );

    expect(result.body_battery).toEqual({ charged: 43, drained: 47 });
    expect(result.body_battery).not.toHaveProperty("events");
  });

  it("rechnet Event-Zeiten über den timezoneOffset der Antwort, nicht über eine feste Zone", () => {
    const result = formatKoerperdaten(
      "2026-06-13",
      hrvVollstaendig as any,
      sleepVollstaendig as any,
      stressVollstaendig as any,
      [
        {
          charged: 43,
          drained: 47,
          bodyBatteryActivityEvent: [
            {
              eventType: "ACTIVITY",
              eventStartTimeGmt: "2026-06-13T06:15:27.0",
              timezoneOffset: -25_200_000, // UTC-7, Trainingslager statt Berlin
              durationInMilliseconds: 30_300_000,
              bodyBatteryImpact: -26,
              shortFeedback: "MAINTAINING_AEROBIC_BASE",
            },
          ],
        },
      ],
      trainingReadinessVollstaendig as any,
    );

    expect(result.body_battery?.events?.[0]?.start).toBe("2026-06-12T23:15");
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
