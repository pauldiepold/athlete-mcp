export interface RawHrv {
  hrvSummary?: {
    status?: string | null;
    lastNightAvg?: number | null;
    weeklyAvg?: number | null;
    baseline?: {
      balancedLow?: number | null;
      balancedUpper?: number | null;
    } | null;
  } | null;
}

export interface RawSleep {
  dailySleepDTO?: {
    sleepTimeSeconds?: number | null;
    deepSleepSeconds?: number | null;
    lightSleepSeconds?: number | null;
    remSleepSeconds?: number | null;
    awakeSleepSeconds?: number | null;
    avgSleepStress?: number | null;
    sleepScores?: {
      overall?: {
        value?: number | null;
        qualifierKey?: string | null;
      } | null;
    } | null;
  } | null;
  avgSkinTempDeviationC?: number | null;
  skinTempDataExists?: boolean | null;
  restingHeartRate?: number | null;
}

export interface RawStress {
  avgStressLevel?: number | null;
  maxStressLevel?: number | null;
}

export interface RawBodyBattery {
  charged?: number | null;
  drained?: number | null;
  bodyBatteryActivityEvent?: RawBodyBatteryEvent[] | null;
}

export interface RawBodyBatteryEvent {
  eventType?: string | null;
  eventStartTimeGmt?: string | null;
  timezoneOffset?: number | null;
  durationInMilliseconds?: number | null;
  bodyBatteryImpact?: number | null;
  shortFeedback?: string | null;
}

export interface RawTrainingReadiness {
  timestampLocal?: string | null;
  score?: number | null;
  level?: string | null;
  feedbackShort?: string | null;
  inputContext?: string | null;
  recoveryTime?: number | null;
  acuteLoad?: number | null;
}

/**
 * Ein Schlaf- oder Aktivitäts-Ereignis, das die Body Battery bewegt hat.
 * `start` kann im Vortag liegen — ein Schlaf-Event beginnt am Abend davor.
 */
export interface BodyBatteryEvent {
  type: string | null;
  start: string | null;
  duration_minutes: number | null;
  impact: number | null;
  feedback: string | null;
}

/**
 * Ein einzelnes Training-Readiness-Reading. Garmin rechnet den Score mehrfach am
 * Tag neu (nach dem Aufwachen, nach einer Aktivität) — `trigger` sagt, welche
 * Neuberechnung es war. Vgl. ADR-0002.
 */
export interface TrainingReadinessReading {
  time: string | null;
  score: number | null;
  level: string | null;
  feedback: string | null;
  trigger: string | null;
  recovery_time_minutes: number | null;
  acute_load: number | null;
}

export interface Koerperdaten {
  date: string;
  hrv: {
    status: string | null;
    last_night_avg: number | null;
    weekly_avg: number | null;
    baseline_low: number | null;
    baseline_high: number | null;
  } | null;
  sleep: {
    duration_seconds: number | null;
    deep_seconds: number | null;
    light_seconds: number | null;
    rem_seconds: number | null;
    awake_seconds: number | null;
    score: number | null;
    score_qualifier: string | null;
    avg_stress: number | null;
    resting_heart_rate: number | null;
  } | null;
  stress: {
    avg: number | null;
    max: number | null;
  } | null;
  body_battery: {
    charged: number | null;
    drained: number | null;
    events?: BodyBatteryEvent[];
  } | null;
  training_readiness: TrainingReadinessReading[] | null;
  skin_temp: {
    deviation_celsius: number | null;
    data_exists: boolean | null;
  } | null;
}

/** `"2026-06-13T06:37:51.0"` → `"2026-06-13T06:37"`. */
function kappeSekunden(timestampLocal: string | null | undefined): string | null {
  return timestampLocal ? timestampLocal.slice(0, 16) : null;
}

/**
 * GMT-Zeitstempel plus Garmins `timezoneOffset` (ms) als lokale Zeit — die Zone
 * kommt aus der Antwort, nicht aus einer Annahme über den Wohnort des Athleten.
 */
function lokaleZeit(
  eventStartTimeGmt: string | null | undefined,
  timezoneOffset: number | null | undefined,
): string | null {
  if (!eventStartTimeGmt) return null;
  const gmt = Date.parse(`${eventStartTimeGmt}Z`);
  if (Number.isNaN(gmt)) return null;
  return new Date(gmt + (timezoneOffset ?? 0)).toISOString().slice(0, 16);
}

export function formatKoerperdaten(
  date: string,
  hrv: RawHrv,
  sleep: RawSleep,
  stress: RawStress,
  bodyBattery: RawBodyBattery[],
  trainingReadiness: RawTrainingReadiness[],
): Koerperdaten {
  const hrvSummary = hrv.hrvSummary ?? null;
  const sleepDTO = sleep.dailySleepDTO ?? null;
  const bb = bodyBattery[0] ?? null;

  const events = (bb?.bodyBatteryActivityEvent ?? []).map(
    (e): BodyBatteryEvent => ({
      type: e.eventType ?? null,
      start: lokaleZeit(e.eventStartTimeGmt, e.timezoneOffset),
      duration_minutes:
        e.durationInMilliseconds != null
          ? Math.round(e.durationInMilliseconds / 60_000)
          : null,
      impact: e.bodyBatteryImpact ?? null,
      feedback: e.shortFeedback ?? null,
    }),
  );

  const readings = trainingReadiness
    .map(
      (r): TrainingReadinessReading => ({
        time: kappeSekunden(r.timestampLocal),
        score: r.score ?? null,
        level: r.level ?? null,
        feedback: r.feedbackShort ?? null,
        trigger: r.inputContext ?? null,
        recovery_time_minutes: r.recoveryTime ?? null,
        acute_load: r.acuteLoad ?? null,
      }),
    )
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  const hasHrv = hrvSummary !== null;
  const hasSleep = sleepDTO?.sleepTimeSeconds != null;
  const hasStress = stress.avgStressLevel != null || stress.maxStressLevel != null;
  const hasBb = bb?.charged != null || bb?.drained != null;
  const hasTr = readings.length > 0;
  const hasSkinTemp = sleep.skinTempDataExists != null;

  return {
    date,
    hrv: hasHrv
      ? {
          status: hrvSummary!.status ?? null,
          last_night_avg: hrvSummary!.lastNightAvg ?? null,
          weekly_avg: hrvSummary!.weeklyAvg ?? null,
          baseline_low: hrvSummary!.baseline?.balancedLow ?? null,
          baseline_high: hrvSummary!.baseline?.balancedUpper ?? null,
        }
      : null,
    sleep: hasSleep
      ? {
          duration_seconds: sleepDTO!.sleepTimeSeconds ?? null,
          deep_seconds: sleepDTO!.deepSleepSeconds ?? null,
          light_seconds: sleepDTO!.lightSleepSeconds ?? null,
          rem_seconds: sleepDTO!.remSleepSeconds ?? null,
          awake_seconds: sleepDTO!.awakeSleepSeconds ?? null,
          score: sleepDTO!.sleepScores?.overall?.value ?? null,
          score_qualifier: sleepDTO!.sleepScores?.overall?.qualifierKey ?? null,
          avg_stress: sleepDTO!.avgSleepStress ?? null,
          resting_heart_rate: sleep.restingHeartRate ?? null,
        }
      : null,
    stress: hasStress
      ? {
          avg: stress.avgStressLevel ?? null,
          max: stress.maxStressLevel ?? null,
        }
      : null,
    body_battery: hasBb
      ? {
          charged: bb!.charged ?? null,
          drained: bb!.drained ?? null,
          ...(events.length > 0 ? { events } : {}),
        }
      : null,
    training_readiness: hasTr ? readings : null,
    skin_temp: hasSkinTemp
      ? {
          deviation_celsius: sleep.avgSkinTempDeviationC ?? null,
          data_exists: sleep.skinTempDataExists ?? null,
        }
      : null,
  };
}
