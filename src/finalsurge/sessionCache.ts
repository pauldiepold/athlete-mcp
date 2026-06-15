/**
 * KV-gestützter, per-Nutzer Session-Cache, damit sich der Server nicht bei jedem
 * Tool-Call neu einloggt (die inoffizielle FS-Login-Frequenz soll niedrig bleiben).
 * Creds liegen pro Nutzer im KV (`user:<userId>:finalsurge`), die gecachte Session
 * unter `user:<userId>:finalsurge:session`. Bei Cache-Miss: Login über die injizierte
 * (reine) login-Funktion mit den KV-Creds und Schreiben mit 6h-TTL.
 */

import type { Session, SessionProvider } from "./finalSurgeClient.js";

const SIX_HOURS_SECONDS = 6 * 60 * 60;

interface FinalSurgeCreds {
  email: string;
  password: string;
}

export class SessionCache implements SessionProvider {
  constructor(
    private readonly kv: KVNamespace,
    private readonly userId: string,
    private readonly login: (email: string, password: string) => Promise<Session>,
    private readonly ttlSeconds: number = SIX_HOURS_SECONDS,
  ) {}

  async getSession(): Promise<Session> {
    const sessionKey = `user:${this.userId}:finalsurge:session`;

    const cached = (await this.kv.get(sessionKey, "json")) as Session | null;
    if (cached) {
      return cached;
    }

    const credsKey = `user:${this.userId}:finalsurge`;
    const creds = (await this.kv.get(credsKey, "json")) as FinalSurgeCreds | null;
    if (!creds?.email || !creds?.password) {
      throw new Error(`Keine Final-Surge-Creds im KV: ${credsKey}`);
    }

    const session = await this.login(creds.email, creds.password);
    await this.kv.put(sessionKey, JSON.stringify(session), {
      expirationTtl: this.ttlSeconds,
    });
    return session;
  }
}
