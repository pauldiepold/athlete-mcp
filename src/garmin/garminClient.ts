/**
 * Tiefes Modul: kapselt die inoffizielle Garmin-Connect-App-API (Pendant zu
 * FinalSurgeClient). Gültiger di_token rein (über den TokenProvider), rohe
 * Körperdaten für ein Datum raus. Versteckt Connect-Endpoints, Bearer-Auth,
 * Datums-Params und die Tatsache, dass die Hauttemperatur in der Schlaf-Antwort
 * steckt (kein eigener Endpoint). Die Formatierung auf die schlanke
 * Körperdaten-Form bleibt — wie bei Final Surge — im Tool (formatKoerperdaten).
 *
 * Endpoints/Datums-Params siehe docs/garmin-connect-api.md (Spike #4).
 */

import type {
  RawHrv,
  RawSleep,
  RawStress,
  RawBodyBattery,
  RawTrainingReadiness,
} from "./formatKoerperdaten.js";
import type { TokenProvider } from "./garminAuth.js";

const BASE_URL = "https://connectapi.garmin.com";

/** Rohe Connect-Antworten eines Tages, gruppiert für formatKoerperdaten. */
export interface RawKoerperdaten {
  hrv: RawHrv;
  sleep: RawSleep;
  stress: RawStress;
  bodyBattery: RawBodyBattery[];
  trainingReadiness: RawTrainingReadiness[];
}

export class GarminClient {
  constructor(
    private readonly auth: TokenProvider,
    private readonly displayName: string,
    private readonly baseUrl: string = BASE_URL,
  ) {}

  /** Rohe Körperdaten für ein explizites Datum (YYYY-MM-DD), alle Metriken parallel. */
  async getKoerperdaten(date: string): Promise<RawKoerperdaten> {
    const token = await this.auth.getAccessToken();

    const sleepUrl = new URL(
      `${this.baseUrl}/wellness-service/wellness/dailySleepData/${this.displayName}`,
    );
    sleepUrl.searchParams.set("date", date);
    sleepUrl.searchParams.set("nonSleepBufferMinutes", "60");

    const bodyBatteryUrl = new URL(
      `${this.baseUrl}/wellness-service/wellness/bodyBattery/reports/daily`,
    );
    bodyBatteryUrl.searchParams.set("startDate", date);
    bodyBatteryUrl.searchParams.set("endDate", date);

    const [hrv, sleep, stress, bodyBattery, trainingReadiness] =
      await Promise.all([
        this.get<RawHrv>(`${this.baseUrl}/hrv-service/hrv/${date}`, token),
        this.get<RawSleep>(sleepUrl, token),
        this.get<RawStress>(
          `${this.baseUrl}/wellness-service/wellness/dailyStress/${date}`,
          token,
        ),
        this.get<RawBodyBattery[]>(bodyBatteryUrl, token),
        this.get<RawTrainingReadiness[]>(
          `${this.baseUrl}/metrics-service/metrics/trainingreadiness/${date}`,
          token,
        ),
      ]);

    return { hrv, sleep, stress, bodyBattery, trainingReadiness };
  }

  private async get<T>(url: string | URL, token: string): Promise<T> {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Garmin-Connect HTTP ${res.status} (${url.toString()})`);
    }

    return (await res.json()) as T;
  }
}
