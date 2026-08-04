/**
 * Spike zu Issue #38 — der deployte Worker. Wegwerf-Code, keine Tests.
 *
 * Zweck ist eine Messung, kein Feature: laeuft der Garmin-SSO-Login aus einer
 * Cloudflare-Datacenter-IP mit Workers-TLS-Fingerprint durch? Lokal (Phase 1/2)
 * tut er das mit plain `fetch` zuverlaessig — dieser Worker importiert exakt
 * dasselbe Modul, damit sich Laptop und Worker in IP und TLS unterscheiden und
 * in sonst nichts.
 *
 * Der Cron ist der Grund, warum die Messung ueberhaupt einen Tag ueberspannen
 * kann: sie laeuft in Cloudflare, nicht auf einem Laptop, der abends zuklappt.
 * Jeder Lauf legt eine Zeile ins KV; `/results` gibt sie gesammelt zurueck.
 *
 * Bewusste Einschraenkungen fuer einen Wegwerf-Endpoint im Netz:
 *
 *  - **Nur das Test-Konto liegt im Worker.** Der Cron kann nicht interaktiv
 *    nach Credentials fragen, also braucht er sie als Secret. Das gilt
 *    ausdruecklich nur fuer GARMIN_TEST_* (kein MFA, Wegwerf-Konto). Das echte
 *    Konto kommt weiterhin ausschliesslich pro Request im Body — und nur fuer
 *    den MFA-Pfad, der ohnehin einen Menschen an der Mail braucht.
 *  - **Keine Tokens in der Antwort.** Zurueck geht nur, *ob* es geklappt hat,
 *    plus Trace. Der displayName bleibt drin, weil er beweist, dass der Login
 *    echt war und nicht nur ein 200 zurueckkam.
 *  - **Bearer-Token-Pflicht** auf allen Routen, damit der Endpoint nicht offen
 *    im Netz steht.
 *
 * Routen:
 *   POST /probe        {email, password}       -> voller Login ohne MFA
 *   POST /mfa/begin    {email, password}       -> {handle} + Mail mit Code
 *   POST /mfa/resume   {handle, code}          -> Login fertig
 *   GET  /results                              -> alle Cron-Messungen
 */

import {
  beginLogin,
  exchangeTicket,
  fetchDisplayName,
  submitMfaCode,
  GarminLoginError,
  type MfaState,
  type Trace,
} from "../garminLogin.js";

interface Env {
  SPIKE_TOKEN: string;
  GARMIN_TEST_EMAIL: string;
  GARMIN_TEST_PASSWORD: string;
  SPIKE_KV: KVNamespace;
}

/** Das Fenster zwischen Passwort und Mail-Code — siehe Issue #38. */
const MFA_TTL_SECONDS = 600;

/** Messzeilen ueberleben den Spike um ein paar Tage, dann sind sie egal. */
const RESULT_TTL_SECONDS = 7 * 24 * 3600;

/** Dieselbe Form wie die Laptop-Seite in phase3_measure.ts, damit sich beides mischen laesst. */
interface Measurement {
  ts: string;
  target: "worker";
  outcome: string;
  step?: string;
  httpStatus?: number;
  message?: string;
  ms: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Fehler immer mit Trace beantworten: der Trace *ist* das Messergebnis. */
function failure(err: unknown, traces: Trace[]): Response {
  if (err instanceof GarminLoginError) {
    return json(
      { outcome: "failed", step: err.step, httpStatus: err.httpStatus, message: err.message, traces },
      200,
    );
  }
  return json({ outcome: "error", message: (err as Error).message, traces }, 200);
}

/**
 * Ein Login-Versuch, auf eine Messzeile reduziert. Wirft nicht: ein
 * gescheiterter Versuch ist hier ein Ergebnis, kein Fehler.
 */
async function measureOnce(env: Env): Promise<Measurement> {
  const started = Date.now();
  const base = { ts: new Date().toISOString(), target: "worker" as const };
  try {
    const begin = await beginLogin(env.GARMIN_TEST_EMAIL, env.GARMIN_TEST_PASSWORD, {
      delayMs: 0,
    });
    if (begin.status === "mfa_required") {
      return { ...base, outcome: "mfa_required", ms: Date.now() - started };
    }
    const tokens = await exchangeTicket(begin.ticket);
    await fetchDisplayName(tokens);
    return { ...base, outcome: "success", ms: Date.now() - started };
  } catch (err) {
    if (err instanceof GarminLoginError) {
      return {
        ...base,
        outcome: "failed",
        step: err.step,
        httpStatus: err.httpStatus,
        message: err.message,
        ms: Date.now() - started,
      };
    }
    return { ...base, outcome: "error", message: (err as Error).message, ms: Date.now() - started };
  }
}

export default {
  /** Stuendlich: ein Versuch, eine KV-Zeile. Zehn Stunden ergeben die Quote. */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const row = await measureOnce(env);
    // Zeitstempel als Key: sortiert sich von selbst und kollidiert nie.
    await env.SPIKE_KV.put(`measure:${row.ts}`, JSON.stringify(row), {
      expirationTtl: RESULT_TTL_SECONDS,
    });
    console.log(`measure ${row.outcome} ${row.ms}ms`);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.headers.get("Authorization") !== `Bearer ${env.SPIKE_TOKEN}`) {
      return json({ error: "unauthorized" }, 401);
    }

    if (pathname === "/results") {
      const list = await env.SPIKE_KV.list({ prefix: "measure:" });
      const rows = await Promise.all(
        list.keys.map(async (k) => JSON.parse((await env.SPIKE_KV.get(k.name))!) as Measurement),
      );
      const ok = rows.filter((r) => r.outcome === "success").length;
      return json({ quote: `${ok}/${rows.length}`, rows });
    }

    if (request.method !== "POST") {
      return json({ error: "POST erwartet" }, 405);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, string>;
    const traces: Trace[] = [];
    // Die Anti-WAF-Pause ist lokal entbehrlich (Phase 1). Sie bleibt als Regler,
    // falls der Worker doch an Cloudflare haengenbleibt.
    const delayMs = Number(body.delayMs ?? 0);

    try {
      if (pathname === "/probe") {
        const started = Date.now();
        const begin = await beginLogin(body.email!, body.password!, { delayMs, traces });
        if (begin.status === "mfa_required") {
          return json({ outcome: "mfa_required", traces, ms: Date.now() - started });
        }
        const tokens = await exchangeTicket(begin.ticket, { traces });
        const displayName = await fetchDisplayName(tokens, { traces });
        return json({
          outcome: "success",
          displayName,
          di_client_id: tokens.di_client_id,
          ms: Date.now() - started,
          traces,
        });
      }

      if (pathname === "/mfa/begin") {
        const begin = await beginLogin(body.email!, body.password!, { delayMs, traces });
        if (begin.status === "success") {
          const tokens = await exchangeTicket(begin.ticket, { traces });
          const displayName = await fetchDisplayName(tokens, { traces });
          return json({ outcome: "success-without-mfa", displayName, traces });
        }
        const handle = crypto.randomUUID();
        await env.SPIKE_KV.put(`mfa:${handle}`, JSON.stringify(begin.state), {
          expirationTtl: MFA_TTL_SECONDS,
        });
        return json({
          outcome: "mfa_required",
          handle,
          ttlSeconds: MFA_TTL_SECONDS,
          stateBytes: JSON.stringify(begin.state).length,
          traces,
        });
      }

      if (pathname === "/mfa/resume") {
        const raw = await env.SPIKE_KV.get(`mfa:${body.handle}`);
        if (!raw) {
          return json({ outcome: "failed", step: "kv", message: "Handle unbekannt oder abgelaufen" });
        }
        const { ticket } = await submitMfaCode(JSON.parse(raw) as MfaState, body.code!, { traces });
        const tokens = await exchangeTicket(ticket, { traces });
        const displayName = await fetchDisplayName(tokens, { traces });
        await env.SPIKE_KV.delete(`mfa:${body.handle}`);
        return json({
          outcome: "success",
          displayName,
          di_client_id: tokens.di_client_id,
          has_refresh_token: Boolean(tokens.di_refresh_token),
          traces,
        });
      }

      return json({ error: "unbekannte Route" }, 404);
    } catch (err) {
      return failure(err, traces);
    }
  },
};
