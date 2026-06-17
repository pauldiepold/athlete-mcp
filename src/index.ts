/**
 * MCP-Server-Shell (dünn): hängt den Streamable-HTTP/MCP-Transport über McpAgent
 * ein und bündelt mehrere Bounded Contexts hinter einer URL (siehe athlete-mcp-ADR).
 * Das Pfad-Secret in der URL identifiziert den Nutzer (TenantResolver: `pathsecret:<secret>`
 * → userId im KV); alle Per-Nutzer-Daten liegen unter `user:<userId>:<context>`.
 *
 * Final Surge = Plan (per-user Creds im KV). Garmin = Körperdaten (per-user Refresh-Token).
 * Strava = Ist (außerhalb, siehe finalsurge/ADR-0001).
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { formatWorkout } from "./finalsurge/formatWorkout.js";
import { FinalSurgeClient, login } from "./finalsurge/finalSurgeClient.js";
import { SessionCache } from "./finalsurge/sessionCache.js";
import { TenantResolver } from "./tenantResolver.js";
import { formatKoerperdaten } from "./garmin/formatKoerperdaten.js";
import type { Koerperdaten } from "./garmin/formatKoerperdaten.js";
import { GarminAuth, refreshTokens } from "./garmin/garminAuth.js";
import { GarminClient } from "./garmin/garminClient.js";
import { KoerperdatenArchive } from "./garmin/koerperdatenArchive.js";
import { getKoerperdatenRange } from "./garmin/koerperdatenReadThrough.js";
import { SteuerungStore } from "./steuerung/steuerungStore.js";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  SESSION_KV: KVNamespace;
  ATHLETE_DB: D1Database;
}

/** Per-Request-Kontext, im fetch-Handler über den TenantResolver aufgelöst. */
interface Props extends Record<string, unknown> {
  userId: string;
}

/** Heutiges Datum in Pauls Zeitzone als YYYY-MM-DD (en-CA liefert ISO-Reihenfolge). */
function todayInBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(new Date());
}

/** Reine Datums-Arithmetik auf YYYY-MM-DD (UTC-Mitternacht, kein TZ-Drift). */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Baut den GarminClient eines Nutzers (per-user Token-Bündel + displayName aus dem KV). */
async function buildGarminClient(
  kv: KVNamespace,
  userId: string,
): Promise<GarminClient> {
  const profile = (await kv.get(`user:${userId}:garmin:profile`, "json")) as {
    display_name?: string;
  } | null;
  const auth = new GarminAuth(kv, userId, refreshTokens);
  return new GarminClient(auth, profile?.display_name ?? "");
}

/** Live-Fetcher für die Read-through-Orchestrierung: roh holen → schlanke Form. */
async function fetchKoerperdatenLive(
  client: GarminClient,
  date: string,
): Promise<Koerperdaten> {
  const raw = await client.getKoerperdaten(date);
  return formatKoerperdaten(
    date,
    raw.hrv,
    raw.sleep,
    raw.stress,
    raw.bodyBattery,
    raw.trainingReadiness,
  );
}

/** Alle userIds mit einem Garmin-Token-Bündel im KV (`user:<id>:garmin`). */
async function listGarminUsers(kv: KVNamespace): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await kv.list({ prefix: "user:", cursor });
    for (const { name } of res.keys) {
      const match = name.match(/^user:(.+):garmin$/);
      if (match) ids.push(match[1]!);
    }
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return ids;
}

const PLAN_HINT =
  "Liefert die GEPLANTEN Coach-Vorgaben aus Final Surge (Plan-Seite). " +
  "Absolvierte Läufe (HR, Pace, Power) kommen separat über den Strava-Connector.";

const BODY_HINT =
  "Liefert rohe KÖRPERDATEN aus Garmin (HRV-Status, Schlaf, Stress/Body Battery, " +
  "Training Readiness, Hauttemperatur) — den täglichen physiologischen Zustand. " +
  "Das sind NICHT absolvierte Läufe (HR/Pace/Power → Strava) und NICHT der geplante " +
  "Trainingsinhalt (Final Surge), sondern Rohwerte ohne interpretierte Tagesform.";

const STEUERUNG_HINT =
  "Der vom Athleten SELBST geschriebene Steuerungs-Store (rohes Markdown, UTF-8, " +
  "rein wie raus). Das ist NICHT der Coach-Plan aus Final Surge (get_planned_workouts) " +
  "und NICHT die Körperdaten aus Garmin, sondern die eigene strategische Steuerung: " +
  "der Steuerungsplan (Block/Periodisierung/Form-Snapshot) plus Wocheneinträge. " +
  "set-Tools überschreiben das jeweilige Objekt komplett.";

export class AthleteMCP extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: "athlete-mcp", version: "1.0.0" });

  async init() {
    await this.initFinalSurge();
    await this.initGarmin();
    await this.initSteuerung();
  }

  /** Final-Surge-Kontext: per-user Creds + gecachte Session aus dem KV. */
  private async initFinalSurge() {
    const cache = new SessionCache(
      this.env.SESSION_KV,
      this.props.userId,
      login,
    );
    const client = new FinalSurgeClient(cache);

    const fetchPlanned = async (start: string, end: string) => {
      const raw = await client.getWorkouts(start, end);
      const planned = raw.map(formatWorkout);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(planned, null, 2) },
        ],
      };
    };

    this.server.tool(
      "get_planned_workouts",
      `Geplante Workouts für einen expliziten Datumsbereich. ${PLAN_HINT}`,
      {
        start_date: z.string().describe("Startdatum YYYY-MM-DD (inklusive)"),
        end_date: z.string().describe("Enddatum YYYY-MM-DD (inklusive)"),
      },
      ({ start_date, end_date }) => fetchPlanned(start_date, end_date),
    );

    this.server.tool(
      "get_upcoming_workouts",
      `Die nächsten N Tage geplanter Workouts (heute inklusive). ${PLAN_HINT}`,
      {
        days: z
          .number()
          .int()
          .positive()
          .default(7)
          .describe("Anzahl Tage ab heute (inklusive heute), Default 7"),
      },
      ({ days }) => {
        const start = todayInBerlin();
        const end = addDays(start, days - 1);
        return fetchPlanned(start, end);
      },
    );
  }

  /** Garmin-Kontext: archive-first aus D1 lesen, fehlende Tage live nachladen + upserten. */
  private async initGarmin() {
    const { userId } = this.props;
    const client = await buildGarminClient(this.env.SESSION_KV, userId);
    const archive = new KoerperdatenArchive(this.env.ATHLETE_DB);
    const fetchLive = (date: string) => fetchKoerperdatenLive(client, date);

    const fetchRange = async (start: string, end: string) => {
      const koerperdaten = await getKoerperdatenRange(
        archive,
        fetchLive,
        userId,
        start,
        end,
      );
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(koerperdaten, null, 2) },
        ],
      };
    };

    this.server.tool(
      "get_koerperdaten",
      `Körperdaten für ein explizites Datum (aus dem Archiv, fehlender Tag wird live nachgeladen). ${BODY_HINT}`,
      {
        date: z.string().describe("Datum YYYY-MM-DD"),
      },
      ({ date }) => fetchRange(date, date),
    );

    this.server.tool(
      "get_koerperdaten_range",
      `Körperdaten für einen Datumsbereich (aus dem Archiv, fehlende Tage werden live nachgeladen). ${BODY_HINT}`,
      {
        start_date: z.string().describe("Startdatum YYYY-MM-DD (inklusive)"),
        end_date: z.string().describe("Enddatum YYYY-MM-DD (inklusive)"),
      },
      ({ start_date, end_date }) => fetchRange(start_date, end_date),
    );
  }

  /** Steuerungs-Kontext: eigenes Write-Modell in D1 (Steuerungsplan + Wochen). */
  private async initSteuerung() {
    const { userId } = this.props;
    const store = new SteuerungStore(this.env.ATHLETE_DB);
    const ok = { content: [{ type: "text" as const, text: "ok" }] };
    const text = (value: string) => ({
      content: [{ type: "text" as const, text: value }],
    });

    this.server.tool(
      "get_steuerungsplan",
      `Liefert den Steuerungsplan als rohes Markdown (leer, wenn noch keiner gesetzt). ${STEUERUNG_HINT}`,
      {},
      async () => text(await store.getPlan(userId)),
    );

    this.server.tool(
      "set_steuerungsplan",
      `Überschreibt den GESAMTEN Steuerungsplan mit dem übergebenen Markdown. ${STEUERUNG_HINT}`,
      {
        content: z.string().describe("Der vollständige Steuerungsplan als Markdown"),
      },
      async ({ content }) => {
        await store.setPlan(userId, content);
        return ok;
      },
    );

    this.server.tool(
      "list_wochen",
      `Listet die vorhandenen Wochen-Keys (kw, aufsteigend; leer bei keinem Eintrag). ${STEUERUNG_HINT}`,
      {},
      async () => text(JSON.stringify(await store.listWochen(userId))),
    );

    this.server.tool(
      "get_woche",
      `Liefert eine Woche als rohes Markdown (leer, wenn die kw nicht existiert). ${STEUERUNG_HINT}`,
      {
        kw: z
          .string()
          .regex(/^\d{4}-W\d{2}$/, "kw im ISO-Format YYYY-Www, z. B. 2026-W25")
          .describe("Kalenderwoche im ISO-Format YYYY-Www (z. B. 2026-W25)"),
      },
      async ({ kw }) => text(await store.getWoche(userId, kw)),
    );

    this.server.tool(
      "set_woche",
      `Überschreibt eine spezifische Woche komplett mit dem übergebenen Markdown (legt sie an, falls neu). ${STEUERUNG_HINT}`,
      {
        kw: z
          .string()
          .regex(/^\d{4}-W\d{2}$/, "kw im ISO-Format YYYY-Www, z. B. 2026-W25")
          .describe("Kalenderwoche im ISO-Format YYYY-Www (z. B. 2026-W25)"),
        content: z.string().describe("Der vollständige Wocheneintrag als Markdown"),
      },
      async ({ kw, content }) => {
        await store.setWoche(userId, kw, content);
        return ok;
      },
    );
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const { pathname } = new URL(request.url);

    const userId = await new TenantResolver(env.SESSION_KV).resolve(pathname);
    if (!userId) {
      return new Response("Not found", { status: 404 });
    }

    // Per-Request-Kontext für McpAgent (landet als this.props in init()).
    (ctx as ExecutionContext & { props: Props }).props = { userId };

    return AthleteMCP.serve(pathname).fetch(request, env, ctx);
  },

  /**
   * Täglicher Cron (archive-first): pro Garmin-Nutzer die gestrigen Körperdaten
   * live holen und ins D1-Archiv upserten. Fehler eines Nutzers (z. B. abgerissener
   * Refresh-Token) blockieren die übrigen nicht.
   */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const yesterday = addDays(todayInBerlin(), -1);
    const archive = new KoerperdatenArchive(env.ATHLETE_DB);

    for (const userId of await listGarminUsers(env.SESSION_KV)) {
      try {
        const client = await buildGarminClient(env.SESSION_KV, userId);
        const daten = await fetchKoerperdatenLive(client, yesterday);
        await archive.upsert(userId, yesterday, daten);
      } catch (err) {
        console.error(`Cron Körperdaten ${userId} ${yesterday}:`, err);
      }
    }
  },
};
