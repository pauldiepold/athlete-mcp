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
 * Warum der Login gescheitert ist — die einzige Unterscheidung, die für den Athleten
 * einen Unterschied macht:
 *
 * - `zugangsdaten` — Final Surge hat *ihn* abgelehnt. Er soll E-Mail und Passwort
 *   prüfen; ein zweiter Versuch mit denselben Daten hilft nicht.
 * - `nicht_erreichbar` — Final Surge hat *uns* abgelehnt oder gar nicht geantwortet.
 *   Seine Daten sind vermutlich richtig, und er soll es später noch einmal versuchen.
 *
 * Ohne die Trennung bekam ein Ausfall bei Final Surge dieselbe Auskunft wie ein
 * Tippfehler — und der Athlet tippte sein korrektes Passwort immer wieder neu.
 */
export type FinalSurgeLoginGrund = "zugangsdaten" | "nicht_erreichbar";

/**
 * Ein gescheiterter Final-Surge-Login mit **zwei** Meldungen — dieselbe Trennung wie
 * bei `GarminLoginFehler`: `message` fürs Log (roh, mit HTTP-Status), `benutzerMeldung`
 * für die Oberfläche.
 */
export class FinalSurgeLoginFehler extends Error {
  constructor(
    message: string,
    readonly grund: FinalSurgeLoginGrund,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "FinalSurgeLoginFehler";
  }

  get benutzerMeldung(): string {
    return FINALSURGE_LOGIN_MELDUNG[this.grund];
  }
}

export const FINALSURGE_LOGIN_MELDUNG: Record<FinalSurgeLoginGrund, string> = {
  zugangsdaten:
    "Final Surge hat die Anmeldung abgelehnt. Bitte prüf E-Mail-Adresse und " +
    "Passwort — es sind die Daten von Final Surge, nicht die dieser Seite.",
  nicht_erreichbar:
    "Final Surge antwortet gerade nicht wie erwartet. Das liegt nicht an dir — " +
    "bitte versuch es in ein paar Minuten noch einmal.",
};

/**
 * Loggt sich per E-Mail/Passwort ein und liefert user_key + Bearer-Token.
 * Reine Funktion (Credentials rein, Session raus) — von SessionCache injizierbar.
 *
 * Scheitert ausschließlich mit `FinalSurgeLoginFehler`, damit der Aufrufer den Grund
 * nicht aus einem Meldungstext raten muss.
 */
export async function login(
  email: string,
  password: string,
  baseUrl: string = BASE_URL,
): Promise<Session> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/login`, {
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
  } catch (err) {
    // Netz weg, DNS, TLS: Hier hat niemand ein Passwort geprüft.
    throw new FinalSurgeLoginFehler(
      `Final-Surge-Login ohne Antwort: ${String(err)}`,
      "nicht_erreichbar",
    );
  }

  if (!res.ok) {
    // 401/403 kommen von der Prüfung selbst, alles andere (429, 5xx, ein HTML-Portal
    // statt der API) sagt nichts über die Zugangsdaten aus.
    throw new FinalSurgeLoginFehler(
      `Final-Surge-Login HTTP ${res.status}`,
      res.status === 401 || res.status === 403
        ? "zugangsdaten"
        : "nicht_erreichbar",
      res.status,
    );
  }

  let body: {
    success?: boolean;
    error_description?: string;
    data?: { user_key?: string; token?: string };
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new FinalSurgeLoginFehler(
      "Final-Surge-Login: Antwort ist kein JSON",
      "nicht_erreichbar",
      res.status,
    );
  }

  // Der Normalfall bei falschen Daten: HTTP 200 mit `success: false`. Deshalb hängt die
  // Einordnung nicht am Status, sondern an diesem Feld.
  if (!body.success) {
    throw new FinalSurgeLoginFehler(
      `Final-Surge-Login abgelehnt: ${body.error_description ?? "unbekannt"}`,
      "zugangsdaten",
      res.status,
    );
  }

  if (!body.data?.user_key || !body.data?.token) {
    // Angenommen, aber ohne Token — daran ist nichts zu prüfen und nichts zu tippen.
    throw new FinalSurgeLoginFehler(
      "Final-Surge-Login: Antwort ohne user_key/token",
      "nicht_erreichbar",
      res.status,
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
