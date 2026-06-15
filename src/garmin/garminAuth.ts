/**
 * Garmin-Token-Lebenszyklus im Worker (Pendant zu SessionCache der Final-Surge-Seite).
 * Kein initialer Login hier: das Bündel wird einmal extern geseedet (lokales CLI, MFA),
 * der Worker refresht nur noch. GarminAuth liest das Bündel aus dem KV, erkennt einen
 * abgelaufenen kurzlebigen di_token am JWT-exp, holt ihn über den Refresh-Token neu und
 * schreibt das aktualisierte Bündel ins KV zurück. Gültige Tokens bleiben unberührt.
 *
 * Siehe ADR-0001 (koerperdaten-live-api-archive-first) und docs/garmin-connect-api.md.
 */

export interface GarminTokens {
  di_token: string;
  di_refresh_token: string;
  di_client_id: string;
}

export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

/** Sicherheitsmarge: kurz vor Ablauf bereits refreshen, statt in ein 401 zu laufen. */
const EXPIRY_MARGIN_SECONDS = 60;

/**
 * Liest die exp-Claim aus dem JWT-Payload und prüft, ob der Token (inkl. Marge)
 * abgelaufen ist. Ein nicht parsbarer Token gilt als abgelaufen.
 */
function isExpired(jwt: string, marginSeconds = EXPIRY_MARGIN_SECONDS): boolean {
  const payload = jwt.split(".")[1];
  if (!payload) return true;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64)) as { exp?: number };
    if (typeof claims.exp !== "number") return true;
    return claims.exp - marginSeconds <= Date.now() / 1000;
  } catch {
    return true;
  }
}

const REFRESH_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";

/**
 * Tauscht den Refresh-Token gegen einen frischen di_token (Standard-OAuth2-
 * Refresh-Grant, headless, ohne MFA). Basic-Auth mit client_id als User und
 * leerem Passwort. Liefert ggf. einen rotierten Refresh-Token zurück, sonst
 * bleibt der alte erhalten. Reine Funktion (Bündel rein, Bündel raus).
 */
export async function refreshTokens(
  tokens: GarminTokens,
  refreshUrl: string = REFRESH_URL,
): Promise<GarminTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: tokens.di_client_id,
    refresh_token: tokens.di_refresh_token,
  });

  const res = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${tokens.di_client_id}:`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Garmin-Token-Refresh HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!data.access_token) {
    throw new Error("Garmin-Token-Refresh ohne access_token");
  }

  return {
    di_token: data.access_token,
    di_refresh_token: data.refresh_token ?? tokens.di_refresh_token,
    di_client_id: tokens.di_client_id,
  };
}

export class GarminAuth implements TokenProvider {
  constructor(
    private readonly kv: KVNamespace,
    private readonly userId: string,
    private readonly refresh: (tokens: GarminTokens) => Promise<GarminTokens>,
  ) {}

  async getAccessToken(): Promise<string> {
    const key = `user:${this.userId}:garmin`;
    const tokens = (await this.kv.get(key, "json")) as GarminTokens | null;
    if (!tokens) {
      throw new Error(`Kein Garmin-Token-Bündel im KV: ${key}`);
    }

    if (!isExpired(tokens.di_token)) {
      return tokens.di_token;
    }

    const refreshed = await this.refresh(tokens);
    await this.kv.put(key, JSON.stringify(refreshed));
    return refreshed.di_token;
  }
}
