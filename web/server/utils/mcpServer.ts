/**
 * Die Tool-Registrierung des MCP-Servers: bündelt die drei Bounded Contexts hinter
 * einer URL (ADR-0001) und ist seit ADR-0007 die Stelle, an der aus der
 * Domänen-Bibliothek unter `src/` ein MCP-Server wird.
 *
 * Vorher lag das in `src/index.ts` an einer `McpAgent`-Unterklasse — also im
 * Durable Object. Beide sind weg: alle zehn Tools sind reine Request/Response-Aufrufe
 * gegen KV und D1, und stateless Streamable HTTP leistet dafür funktional dasselbe.
 * `src/` bleibt dadurch eine Bibliothek ohne Framework-Bezug; die Verdrahtung mit
 * Nitro liegt hier.
 *
 * Bewusst **synchron**: der Server wird pro Request neu gebaut (stateless), also darf
 * das Bauen selbst nichts abrufen. Alles, was I/O braucht — allen voran der
 * Garmin-Client mit seinem Token-Refresh —, entsteht erst im Tool-Aufruf. So kosten
 * `initialize` und `tools/list` keinen einzigen KV-Zugriff.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { formatWorkout } from '@shared/finalsurge/formatWorkout'
import { FinalSurgeClient, login } from '@shared/finalsurge/finalSurgeClient'
import { SessionCache } from '@shared/finalsurge/sessionCache'
import { buildDashboardLinks } from '@shared/dashboardLink'
import { KoerperdatenArchive } from '@shared/garmin/koerperdatenArchive'
import { buildGarminClient, fetchKoerperdatenLive } from '@shared/garmin/koerperdatenLive'
import { addDays } from '@shared/garmin/koerperdatenNachlauf'
import { getKoerperdatenRange } from '@shared/garmin/koerperdatenReadThrough'
import { SteuerungStore } from '@shared/steuerung/steuerungStore'
import { heuteInBerlin } from '@shared/zeitzone'

/** Alles, was die Tools eines Requests brauchen. */
export interface McpKontext {
  /** Der aufgelöste Athlet — bis Issue #43 über das Pfad-Secret der MCP-URL. */
  userId: string
  kv: KVNamespace
  db: D1Database
  /**
   * Die Origin dieses Requests (`https://…`, ohne Schrägstrich am Ende) — die Basis
   * der von `get_dashboard_link` ausgegebenen Browser-Links. Seit ADR-0007 liegen
   * MCP-Endpunkt und Weboberfläche auf **derselben** Origin, also ist sie ableitbar
   * statt konfiguriert; `WEB_BASE_URL` ist damit entfallen.
   */
  origin: string
}

const PLAN_HINT =
  'Liefert die GEPLANTEN Coach-Vorgaben aus Final Surge (Plan-Seite). ' +
  'Absolvierte Läufe (HR, Pace, Power) kommen separat über den Strava-Connector.'

const BODY_HINT =
  'Liefert rohe KÖRPERDATEN aus Garmin (HRV-Status, Schlaf, Stress/Body Battery, ' +
  'Training Readiness, Hauttemperatur) — den täglichen physiologischen Zustand. ' +
  'Das sind NICHT absolvierte Läufe (HR/Pace/Power → Strava) und NICHT der geplante ' +
  'Trainingsinhalt (Final Surge), sondern Rohwerte ohne interpretierte Tagesform.'

const STEUERUNG_HINT =
  'Der vom Athleten SELBST geschriebene Steuerungs-Store (rohes Markdown, UTF-8, ' +
  'rein wie raus). Das ist NICHT der Coach-Plan aus Final Surge (get_planned_workouts) ' +
  'und NICHT die Körperdaten aus Garmin, sondern die eigene strategische Steuerung: ' +
  'der Steuerungsplan (Block/Periodisierung/Form-Snapshot) plus Wocheneinträge. ' +
  'set-Tools überschreiben das jeweilige Objekt komplett.'

const DASHBOARD_HINT =
  'Die Browser-Fläche des Athleten: Körperdaten-Dashboard (Verläufe, ' +
  'Körperdaten-Index, Tages-Detail) und darunter die Steuerung zum Lesen/Editieren. ' +
  'Die Links sind für alle gleich und enthalten kein Secret — wer welche Daten sieht, ' +
  'entscheidet die Anmeldung im Browser.'

/** Ein einzelner Text-Block als Tool-Antwort. */
function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] }
}

const KW_SCHEMA = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, 'kw im ISO-Format YYYY-Www, z. B. 2026-W25')
  .describe('Kalenderwoche im ISO-Format YYYY-Www (z. B. 2026-W25)')

/** Final-Surge-Kontext: per-user Creds + gecachte Session aus dem KV. */
function registerFinalSurge(server: McpServer, { userId, kv }: McpKontext): void {
  const fetchPlanned = async (start: string, end: string) => {
    const cache = new SessionCache(kv, userId, login)
    const raw = await new FinalSurgeClient(cache).getWorkouts(start, end)
    return text(JSON.stringify(raw.map(formatWorkout), null, 2))
  }

  server.registerTool(
    'get_planned_workouts',
    {
      description: `Geplante Workouts für einen expliziten Datumsbereich. ${PLAN_HINT}`,
      inputSchema: {
        start_date: z.string().describe('Startdatum YYYY-MM-DD (inklusive)'),
        end_date: z.string().describe('Enddatum YYYY-MM-DD (inklusive)'),
      },
    },
    ({ start_date, end_date }) => fetchPlanned(start_date, end_date),
  )

  server.registerTool(
    'get_upcoming_workouts',
    {
      description: `Die nächsten N Tage geplanter Workouts (heute inklusive). ${PLAN_HINT}`,
      inputSchema: {
        days: z
          .number()
          .int()
          .positive()
          .default(7)
          .describe('Anzahl Tage ab heute (inklusive heute), Default 7'),
      },
    },
    ({ days }) => {
      const start = heuteInBerlin()
      return fetchPlanned(start, addDays(start, days - 1))
    },
  )
}

/** Garmin-Kontext: archive-first aus D1 lesen; heute/gestern und Lücken live nachladen + upserten. */
function registerGarmin(server: McpServer, { userId, kv, db }: McpKontext): void {
  // Hinweise zu gescheiterten Live-Abrufen gehen als eigener Text-Block VOR das
  // JSON; das JSON selbst bleibt ein nacktes Array, damit die Skills nicht brechen.
  const fetchRange = async (start: string, end: string) => {
    const client = await buildGarminClient(kv, userId)
    const { koerperdaten, hinweise } = await getKoerperdatenRange({
      store: new KoerperdatenArchive(db),
      fetchLive: (date: string) => fetchKoerperdatenLive(client, date),
      userId,
      start,
      end,
      heute: heuteInBerlin(),
    })
    const hinweisBlock = hinweise.length
      ? [{ type: 'text' as const, text: hinweise.join('\n') }]
      : []
    return {
      content: [
        ...hinweisBlock,
        { type: 'text' as const, text: JSON.stringify(koerperdaten, null, 2) },
      ],
    }
  }

  server.registerTool(
    'get_koerperdaten',
    {
      description: `Körperdaten für ein explizites Datum (archive-first; heute und gestern immer live). ${BODY_HINT}`,
      inputSchema: { date: z.string().describe('Datum YYYY-MM-DD') },
    },
    ({ date }) => fetchRange(date, date),
  )

  server.registerTool(
    'get_koerperdaten_range',
    {
      description: `Körperdaten für einen Datumsbereich (archive-first; heute und gestern immer live). ${BODY_HINT}`,
      inputSchema: {
        start_date: z.string().describe('Startdatum YYYY-MM-DD (inklusive)'),
        end_date: z.string().describe('Enddatum YYYY-MM-DD (inklusive)'),
      },
    },
    ({ start_date, end_date }) => fetchRange(start_date, end_date),
  )
}

/** Steuerungs-Kontext: eigenes Write-Modell in D1 (Steuerungsplan + Wochen). */
function registerSteuerung(server: McpServer, { userId, db }: McpKontext): void {
  const store = new SteuerungStore(db)
  const ok = text('ok')

  server.registerTool(
    'get_steuerungsplan',
    {
      description: `Liefert den Steuerungsplan als rohes Markdown (leer, wenn noch keiner gesetzt). ${STEUERUNG_HINT}`,
      inputSchema: {},
    },
    async () => text(await store.getPlan(userId)),
  )

  server.registerTool(
    'set_steuerungsplan',
    {
      description: `Überschreibt den GESAMTEN Steuerungsplan mit dem übergebenen Markdown. ${STEUERUNG_HINT}`,
      inputSchema: {
        content: z.string().describe('Der vollständige Steuerungsplan als Markdown'),
      },
    },
    async ({ content }) => {
      await store.setPlan(userId, content)
      return ok
    },
  )

  server.registerTool(
    'list_wochen',
    {
      description: `Listet die vorhandenen Wochen-Keys (kw, aufsteigend; leer bei keinem Eintrag). ${STEUERUNG_HINT}`,
      inputSchema: {},
    },
    async () => text(JSON.stringify(await store.listWochen(userId))),
  )

  server.registerTool(
    'get_woche',
    {
      description: `Liefert eine Woche als rohes Markdown (leer, wenn die kw nicht existiert). ${STEUERUNG_HINT}`,
      inputSchema: { kw: KW_SCHEMA },
    },
    async ({ kw }) => text(await store.getWoche(userId, kw)),
  )

  server.registerTool(
    'set_woche',
    {
      description: `Überschreibt eine spezifische Woche komplett mit dem übergebenen Markdown (legt sie an, falls neu). ${STEUERUNG_HINT}`,
      inputSchema: {
        kw: KW_SCHEMA,
        content: z.string().describe('Der vollständige Wocheneintrag als Markdown'),
      },
    },
    async ({ kw, content }) => {
      await store.setWoche(userId, kw, content)
      return ok
    },
  )
}

/**
 * Browser-Links: seit ADR-0007 statische Pfade unter der Origin des Requests.
 *
 * Vorher wurde hier das View-Secret des Athleten rückwärts aus dem KV gesucht — der
 * Link war die Anmeldung, also war er pro Athlet ein anderer. Jetzt gibt es nur noch
 * eine Fläche unter festen Pfaden; wer dort was sieht, entscheidet die Session im
 * Browser. Damit fällt auch der Fall „für diesen Nutzer ist keine Fläche eingerichtet"
 * weg: Es gibt für jeden Athleten eine.
 */
function registerDashboard(server: McpServer, { origin }: McpKontext): void {
  server.registerTool(
    'get_dashboard_link',
    {
      description: `Liefert den Browser-Link des Athleten zu seinem Körperdaten-Dashboard. ${DASHBOARD_HINT}`,
      inputSchema: {},
    },
    () => {
      const links = buildDashboardLinks(origin)
      return text(
        [
          `Dashboard (Körperdaten-Verläufe): ${links.dashboard}`,
          `Steuerung (Plan + Wochen): ${links.steuerung}`,
          `Tages-Detail: ${links.tagVorlage} (Datum einsetzen)`,
        ].join('\n'),
      )
    },
  )
}

/** Der fertig registrierte MCP-Server für genau einen Request eines Athleten. */
export function buildMcpServer(kontext: McpKontext): McpServer {
  const server = new McpServer(
    { name: 'athlete-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  registerFinalSurge(server, kontext)
  registerGarmin(server, kontext)
  registerSteuerung(server, kontext)
  registerDashboard(server, kontext)

  return server
}
