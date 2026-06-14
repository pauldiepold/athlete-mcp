/**
 * Tiefes Modul: kapselt die inoffizielle Final-Surge-App-API.
 * Login (POST /login) und Workout-Abruf (GET /WorkoutList) liegen hier,
 * inklusive Bearer-Auth, Query-Params und Fehlerbehandlung (success=false → Fehler).
 */

import type { RawWorkout } from "./formatWorkout.js";

const BASE_URL = "https://beta.finalsurge.com/api";

export interface Session {
  userKey: string;
  token: string;
}

export interface SessionProvider {
  getSession(): Promise<Session>;
}

/**
 * Loggt sich per E-Mail/Passwort ein und liefert user_key + Bearer-Token.
 * Reine Funktion (Credentials rein, Session raus) — von SessionCache injizierbar.
 */
export async function login(
  email: string,
  password: string,
  baseUrl: string = BASE_URL,
): Promise<Session> {
  const res = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      deviceManufacturer: "",
      deviceModel: "MCPServer",
      deviceOperatingSystem: "Linux",
    }),
  });

  if (!res.ok) {
    throw new Error(`Final-Surge-Login HTTP ${res.status}`);
  }

  const body = (await res.json()) as {
    success?: boolean;
    error_description?: string;
    data?: { user_key?: string; token?: string };
  };

  if (!body.success || !body.data?.user_key || !body.data?.token) {
    throw new Error(
      `Final-Surge-Login fehlgeschlagen: ${body.error_description ?? "unbekannt"}`,
    );
  }

  return { userKey: body.data.user_key, token: body.data.token };
}

export class FinalSurgeClient {
  constructor(
    private readonly sessions: SessionProvider,
    private readonly baseUrl: string = BASE_URL,
  ) {}

  /**
   * Geplante Workouts für einen Datumsbereich (YYYY-MM-DD, inklusive).
   * Holt die Session über den SessionProvider — Auth bleibt hier versteckt.
   */
  async getWorkouts(start: string, end: string): Promise<RawWorkout[]> {
    const { userKey, token } = await this.sessions.getSession();

    const url = new URL(`${this.baseUrl}/WorkoutList`);
    url.searchParams.set("scope", "USER");
    url.searchParams.set("scopekey", userKey);
    url.searchParams.set("startdate", start);
    url.searchParams.set("enddate", end);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Final-Surge-WorkoutList HTTP ${res.status}`);
    }

    const body = (await res.json()) as {
      success?: boolean;
      error_description?: string;
      data?: RawWorkout[];
    };

    if (!body.success) {
      throw new Error(
        `Final-Surge-WorkoutList fehlgeschlagen: ${body.error_description ?? "unbekannt"}`,
      );
    }

    return body.data ?? [];
  }
}
