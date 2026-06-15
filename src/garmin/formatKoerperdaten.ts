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
}

export interface RawTrainingReadiness {
  score?: number | null;
  level?: string | null;
  feedbackShort?: string | null;
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
  } | null;
  training_readiness: {
    score: number | null;
    level: string | null;
    feedback: string | null;
  } | null;
  skin_temp: {
    deviation_celsius: number | null;
    data_exists: boolean | null;
  } | null;
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
  const tr = trainingReadiness[0] ?? null;

  const hasHrv = hrvSummary !== null;
  const hasSleep = sleepDTO?.sleepTimeSeconds != null;
  const hasStress = stress.avgStressLevel != null || stress.maxStressLevel != null;
  const hasBb = bb?.charged != null || bb?.drained != null;
  const hasTr = tr !== null;
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
        }
      : null,
    training_readiness: hasTr
      ? {
          score: tr!.score ?? null,
          level: tr!.level ?? null,
          feedback: tr!.feedbackShort ?? null,
        }
      : null,
    skin_temp: hasSkinTemp
      ? {
          deviation_celsius: sleep.avgSkinTempDeviationC ?? null,
          data_exists: sleep.skinTempDataExists ?? null,
        }
      : null,
  };
}
