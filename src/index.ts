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
import { resolveDashboardLinks } from "./dashboardLink.js";
import { KoerperdatenArchive } from "./garmin/koerperdatenArchive.js";
import {
  buildGarminClient,
  fetchKoerperdatenLive,
} from "./garmin/koerperdatenLive.js";
import { getKoerperdatenRange } from "./garmin/koerperdatenReadThrough.js";
import { SteuerungStore } from "./steuerung/steuerungStore.js";
import { handleSteuerungView } from "./steuerung/steuerungView.js";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  SESSION_KV: KVNamespace;
  ATHLETE_DB: D1Database;
  /** Basis-URL des Nuxt-Targets (eigener Worker, ADR-0004) für den Browser-Link. */
  WEB_BASE_URL: string;
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

const DASHBOARD_HINT =
  "Die persönliche Browser-Fläche des Athleten: Körperdaten-Dashboard (Verläufe, " +
  "Körperdaten-Index, Tages-Detail) und darunter die Steuerung zum Lesen/Editieren. " +
  "Der Link enthält das persönliche View-Secret und ist damit die Anmeldung — " +
  "nur an den Athleten selbst ausgeben, nie weitergeben.";

export class AthleteMCP extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: "athlete-mcp", version: "1.0.0" });

  async init() {
    await this.initFinalSurge();
    await this.initGarmin();
    await this.initSteuerung();
    await this.initDashboard();
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

  /** Garmin-Kontext: archive-first aus D1 lesen; heute/gestern und Lücken live nachladen + upserten. */
  private async initGarmin() {
    const { userId } = this.props;
    const client = await buildGarminClient(this.env.SESSION_KV, userId);
    const archive = new KoerperdatenArchive(this.env.ATHLETE_DB);
    const fetchLive = (date: string) => fetchKoerperdatenLive(client, date);

    // Hinweise zu gescheiterten Live-Abrufen gehen als eigener Text-Block VOR das
    // JSON; das JSON selbst bleibt ein nacktes Array, damit die Skills nicht brechen.
    const fetchRange = async (start: string, end: string) => {
      const { koerperdaten, hinweise } = await getKoerperdatenRange({
        store: archive,
        fetchLive,
        userId,
        start,
        end,
        heute: todayInBerlin(),
      });
      const hinweisBlock = hinweise.length
        ? [{ type: "text" as const, text: hinweise.join("\n") }]
        : [];
      return {
        content: [
          ...hinweisBlock,
          { type: "text" as const, text: JSON.stringify(koerperdaten, null, 2) },
        ],
      };
    };

    this.server.tool(
      "get_koerperdaten",
      `Körperdaten für ein explizites Datum (archive-first; heute und gestern immer live). ${BODY_HINT}`,
      {
        date: z.string().describe("Datum YYYY-MM-DD"),
      },
      ({ date }) => fetchRange(date, date),
    );

    this.server.tool(
      "get_koerperdaten_range",
      `Körperdaten für einen Datumsbereich (archive-first; heute und gestern immer live). ${BODY_HINT}`,
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

  /** Eigener Browser-Link: View-Secret rückwärts auflösen und die URLs ausgeben. */
  private async initDashboard() {
    const { userId } = this.props;

    this.server.tool(
      "get_dashboard_link",
      `Liefert den persönlichen Browser-Link des Athleten zu seinem Körperdaten-Dashboard. ${DASHBOARD_HINT}`,
      {},
      async () => {
        const links = await resolveDashboardLinks(
          this.env.SESSION_KV,
          userId,
          this.env.WEB_BASE_URL,
        );
        const text = links
          ? [
              `Dashboard (Körperdaten-Verläufe): ${links.dashboard}`,
              `Steuerung (Plan + Wochen): ${links.steuerung}`,
              `Tages-Detail: ${links.tagVorlage} (Datum einsetzen)`,
            ].join("\n")
          : "Für diesen Nutzer ist keine Browser-Fläche eingerichtet (kein View-Secret geseedet).";
        return { content: [{ type: "text" as const, text }] };
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

    // Zweite Surface: read-only HTML-Ansicht auf den Steuerungs-Store (eigenes
    // View-Secret, siehe ADR-0003). Liefert null, wenn es keine View-Route ist.
    const view = await handleSteuerungView(
      pathname,
      env.SESSION_KV,
      env.ATHLETE_DB,
    );
    if (view) {
      return view;
    }

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
