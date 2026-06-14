/**
 * KV-gestützter Session-Cache, damit sich der Server nicht bei jedem Tool-Call
 * neu einloggt (die inoffizielle FS-Login-Frequenz soll niedrig bleiben).
 * Bei Cache-Miss oder abgelaufenem Eintrag: Re-Login über die injizierte
 * login-Funktion und Schreiben mit 6h-TTL.
 */

import type { Session, SessionProvider } from "./finalSurgeClient.js";

const CACHE_KEY = "finalsurge:session";
const SIX_HOURS_SECONDS = 6 * 60 * 60;

export class SessionCache implements SessionProvider {
  constructor(
    private readonly kv: KVNamespace,
    private readonly login: () => Promise<Session>,
    private readonly ttlSeconds: number = SIX_HOURS_SECONDS,
  ) {}

  async getSession(): Promise<Session> {
    const cached = (await this.kv.get(CACHE_KEY, "json")) as Session | null;
    if (cached) {
      return cached;
    }

    const session = await this.login();
    await this.kv.put(CACHE_KEY, JSON.stringify(session), {
      expirationTtl: this.ttlSeconds,
    });
    return session;
  }
}
