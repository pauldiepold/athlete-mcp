/**
 * MCP-Server-Shell (dünn): registriert die zwei Tools, hängt den Streamable-HTTP/MCP-
 * Transport über McpAgent ein und schützt den Zugriff per Secret im URL-Pfad.
 *
 * Final Surge = Plan. Strava = Ist (siehe ADR-0001). Dieser Server liefert nur den Plan.
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { formatWorkout } from "./formatWorkout.js";
import { FinalSurgeClient, login } from "./finalSurgeClient.js";
import { SessionCache } from "./sessionCache.js";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  SESSION_KV: KVNamespace;
  FINAL_SURGE_EMAIL: string;
  FINAL_SURGE_PASSWORD: string;
  MCP_PATH_SECRET: string;
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

const PLAN_HINT =
  "Liefert die GEPLANTEN Coach-Vorgaben aus Final Surge (Plan-Seite). " +
  "Absolvierte Läufe (HR, Pace, Power) kommen separat über den Strava-Connector.";

export class FinalSurgeMCP extends McpAgent<Env> {
  server = new McpServer({ name: "Final Surge", version: "1.0.0" });

  async init() {
    const cache = new SessionCache(this.env.SESSION_KV, () =>
      login(this.env.FINAL_SURGE_EMAIL, this.env.FINAL_SURGE_PASSWORD),
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
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const { pathname } = new URL(request.url);
    const expectedPath = `/${env.MCP_PATH_SECRET}/mcp`;

    if (pathname === expectedPath) {
      return FinalSurgeMCP.serve(expectedPath).fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
