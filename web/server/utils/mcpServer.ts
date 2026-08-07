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
import { ERSTKONTAKT_SATZ } from '@shared/steuerung/erstkontakt'
import { SteuerungStore } from '@shared/steuerung/steuerungStore'
// Die Verfahrenstexte als Rohtext ins Bundle (ADR-0008). Nitro löst `.md`-Importe von
// sich aus zu einem String auf; für Vitest tut das der Plugin in web/vitest.config.ts.
import verfahrenMakro from '@shared/steuerung/verfahren/makroperiodisierung.md'
import verfahrenOnboarding from '@shared/steuerung/verfahren/onboarding.md'
import verfahrenWoche from '@shared/steuerung/verfahren/wochensteuerung.md'
import {
  beobachte,
  DATENQUELLE_NAMEN,
  FEHLER_MELDUNG,
  istVerbunden,
  meldeErfolg,
  meldeFehler,
} from '@shared/verbindungen'
import type { Datenquelle } from '@shared/verbindungen'
import { heuteInBerlin } from '@shared/zeitzone'

/** Alles, was die Tools eines Requests brauchen. */
export interface McpKontext {
  /** Der aufgelöste Athlet — seit Issue #43 aus dem Bearer-Token, nicht aus der URL. */
  userId: string
  kv: KVNamespace
  db: D1Database
  /**
   * Die Origin dieses Requests (`https://…`, ohne Schrägstrich am Ende) — die Basis
   * der von `get_web_links` ausgegebenen Browser-Links. Seit ADR-0007 liegen
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
  'Körperdaten-Index, Tages-Detail), darunter die Steuerung zum Lesen/Editieren und ' +
  'die Einstellungen, in denen der Athlet seine Verbindungen zu Final Surge und ' +
  'Garmin selbst einrichtet. ' +
  'Die Links sind für alle gleich und enthalten kein Secret — wer welche Daten sieht, ' +
  'entscheidet die Anmeldung im Browser.'

/** Ein einzelner Text-Block als Tool-Antwort. */
function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] }
}

/**
 * Die Antwort eines Tools, dessen Datenquelle noch nicht verbunden ist (Issue #44).
 *
 * **Kein `isError`.** Eine fehlende Verbindung ist ein *Zustand*, kein Fehlschlag: Der
 * Athlet hat sie noch nicht eingerichtet, und das ist beim ersten Gespräch der
 * Normalfall. Als Fehler markiert würde Claude entschuldigend abbrechen, statt den
 * einen Satz weiterzureichen, der weiterhilft — den Link.
 *
 * **Keine internen Details.** Kein KV-Schlüssel, kein „user:…", kein HTTP-Status: Was
 * hier steht, liest der Athlet im Chat.
 *
 * Alle Tools bleiben dabei registriert, unabhängig vom Zustand. Sie zustandsabhängig
 * zu registrieren wäre eleganter, scheitert aber am fehlenden SSE: Ohne Durable Object
 * gibt es kein `notifications/tools/list_changed`, eine später hergestellte Verbindung
 * tauchte in Claudes gecachter Werkzeugliste nie auf, und der Athlet müsste seinen
 * Connector neu einrichten.
 */
function nichtVerbunden(quelle: Datenquelle, origin: string) {
  const name = DATENQUELLE_NAMEN[quelle]
  return text(
    `${name} ist noch nicht mit diesem Konto verbunden — deshalb gibt es dazu gerade `
    + `keine Daten. Der Athlet richtet die Verbindung hier ein: `
    + `${buildDashboardLinks(origin).einrichtung}`,
  )
}

const KW_SCHEMA = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, 'kw im ISO-Format YYYY-Www, z. B. 2026-W25')
  .describe('Kalenderwoche im ISO-Format YYYY-Www (z. B. 2026-W25)')

/** Final-Surge-Kontext: per-user Zugangsdaten + gecachte Session aus dem KV. */
function registerFinalSurge(server: McpServer, { userId, kv, origin }: McpKontext): void {
  const fetchPlanned = async (start: string, end: string) => {
    if (!(await istVerbunden(kv, userId, 'finalsurge'))) {
      return nichtVerbunden('finalsurge', origin)
    }

    // `beobachte` ist der zweite Zustand aus Issue #44: Ob die hinterlegten
    // Zugangsdaten noch gelten, weiß man erst beim Benutzen — dieser Aufruf ist der
    // Beweis in die eine wie in die andere Richtung.
    return beobachte(kv, userId, 'finalsurge', async () => {
      const cache = new SessionCache(kv, userId, login)
      const raw = await new FinalSurgeClient(cache).getWorkouts(start, end)
      return text(JSON.stringify(raw.map(formatWorkout), null, 2))
    })
  }

  server.registerTool(
    'get_planned_workouts',
    {
      title: 'Coach-Plan (Zeitraum)',
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
      title: 'Coach-Plan (nächste Tage)',
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
function registerGarmin(server: McpServer, { userId, kv, db, origin }: McpKontext): void {
  // Hinweise zu gescheiterten Live-Abrufen gehen als eigener Text-Block VOR das
  // JSON; das JSON selbst bleibt ein nacktes Array, wie die Verfahren es erwarten.
  const fetchRange = async (start: string, end: string) => {
    if (!(await istVerbunden(kv, userId, 'garmin'))) {
      return nichtVerbunden('garmin', origin)
    }

    const client = await buildGarminClient(kv, userId)

    // Der zweite Zustand aus Issue #44, hier von Hand statt über `beobachte`:
    // `getKoerperdatenRange` wirft nicht, es sammelt gescheiterte Tage als Hinweise
    // ein (archive-first, ADR-0001). Beobachtet wird deshalb der Live-Pfad selbst.
    //
    // Die Auswertung ist bewusst asymmetrisch: **ein** geglückter Abruf beweist, dass
    // die Verbindung trägt; kaputt ist sie erst, wenn *kein* Versuch durchkam. Ein
    // einzelner Tag, den Garmin nicht liefert, ist Alltag und darf keinen Marker
    // setzen. Und wo gar nicht live geholt wurde (alles im Archiv), sagt der Aufruf
    // über die Verbindung nichts aus — dann bleibt der Marker, wie er war.
    let liveVersuche = 0
    let liveErfolge = 0

    const { koerperdaten, hinweise } = await getKoerperdatenRange({
      store: new KoerperdatenArchive(db),
      fetchLive: async (date: string) => {
        liveVersuche++
        const daten = await fetchKoerperdatenLive(client, date)
        liveErfolge++
        return daten
      },
      userId,
      start,
      end,
      heute: heuteInBerlin(),
    })

    if (liveVersuche > 0) {
      await (liveErfolge > 0
        ? meldeErfolg(kv, userId, 'garmin')
        : meldeFehler(kv, userId, 'garmin', FEHLER_MELDUNG.garmin))
    }

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
    'get_body_metrics',
    {
      title: 'Körperdaten (Tag)',
      description: `Körperdaten für ein explizites Datum (archive-first; heute und gestern immer live). ${BODY_HINT}`,
      inputSchema: { date: z.string().describe('Datum YYYY-MM-DD') },
    },
    ({ date }) => fetchRange(date, date),
  )

  server.registerTool(
    'get_body_metrics_range',
    {
      title: 'Körperdaten (Zeitraum)',
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
    'get_training_profile',
    {
      title: 'Grundlagen lesen',
      description: `Liefert den Steuerungsplan als rohes Markdown (leer, wenn noch keiner gesetzt). ${STEUERUNG_HINT}`,
      inputSchema: {},
    },
    async () => text(await store.getPlan(userId)),
  )

  server.registerTool(
    'set_training_profile',
    {
      title: 'Grundlagen schreiben',
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
    'list_weeks',
    {
      title: 'Wochen auflisten',
      description: `Listet die vorhandenen Wochen-Keys (kw, aufsteigend; leer bei keinem Eintrag). ${STEUERUNG_HINT}`,
      inputSchema: {},
    },
    async () => text(JSON.stringify(await store.listWochen(userId))),
  )

  server.registerTool(
    'get_week',
    {
      title: 'Woche lesen',
      description: `Liefert eine Woche als rohes Markdown (leer, wenn die kw nicht existiert). ${STEUERUNG_HINT}`,
      inputSchema: { kw: KW_SCHEMA },
    },
    async ({ kw }) => text(await store.getWoche(userId, kw)),
  )

  server.registerTool(
    'set_week',
    {
      title: 'Woche schreiben',
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
 *
 * Die Antwort trägt **benannte Felder** statt einer Prosa-Liste (Issue #58): Es sind
 * vier Links, und die Verfahrenstexte schicken den Athleten mal in die Einstellungen,
 * mal auf die Steuerung. Über einen Feldnamen greift ein Verfahren genau den, den es
 * meint; aus einer Aufzählung müsste das Modell ihn raten.
 */
function registerDashboard(server: McpServer, { origin }: McpKontext): void {
  server.registerTool(
    'get_web_links',
    {
      title: 'Links zur Weboberfläche',
      description:
        'Liefert die Links zur Weboberfläche des Athleten als JSON-Objekt mit benannten '
        + 'Feldern: `dashboard` (Körperdaten-Verläufe), `steuerung` (Plan + Wochen), '
        + '`tagVorlage` (Tages-Detail; `YYYY-MM-DD` durch das Datum ersetzen) und '
        + `\`einrichtung\` (Einstellungen: Profil + Verbindungen). ${DASHBOARD_HINT}`,
      inputSchema: {},
    },
    () => text(JSON.stringify(buildDashboardLinks(origin), null, 2)),
  )
}

/**
 * Die Verfahren: die Arbeitsweise selbst, als Tool-Antwort statt als hochgeladener
 * Skill (ADR-0008).
 *
 * Die `description` ist hier der tragende Teil. Ein Spike hat gezeigt, dass claude.ai
 * die Server-`instructions` des MCP-Protokolls dem Modell **nicht** vorlegt — es gibt
 * also keine Always-on-Ebene, und die Beschreibung ist das Einzige, woran das Modell
 * erkennt, wann es zugreift. Sie übernimmt deshalb die Auslöser, die vorher in der
 * Frontmatter der beiden Skills standen, inklusive der Trennung „Was steht heute an?"
 * gegen „Bin ich auf Kurs für mein Ziel?".
 *
 * Der Text selbst liegt als Markdown unter `src/steuerung/verfahren/` — diffbar und
 * reviewbar statt als String im Code — und wird beim Build hereingezogen.
 */
const VERFAHREN_WOCHE_BESCHREIBUNG =
  'Taktische Wochen- und Tagessteuerung fürs Lauftraining dieses Athleten Richtung '
  + 'Zielrennen. Rufe dieses Tool auf und folge dem zurückgegebenen Verfahren, wann '
  + 'immer der Athlet nach seinem aktuellen Training fragt – z. B. "Was steht '
  + 'heute/diese Woche an?", "Wie war mein letzter Lauf?", "Soll ich das geplante '
  + 'Workout so machen?", "Passt die Einheit für mich?", nach einer Auswertung der '
  + 'letzten Tage, nach einem Soll/Ist-Vergleich (geplant vs. gelaufen), oder nach '
  + 'Vorschlägen fürs Kraft-/Stabitraining. Auch für das wöchentliche '
  + 'Sonntagabend-Ritual (Rückblick + Entwurf der kommenden Woche). Auch aufrufen, '
  + 'wenn der Athlet nur beiläufig über seine Woche, eine konkrete Einheit oder seine '
  + 'aktuelle Belastung spricht. Für die langfristige Periodisierung Richtung '
  + 'Zielrennen stattdessen get_playbook_season aufrufen.'

const VERFAHREN_MAKRO_BESCHREIBUNG =
  'Strategische Langzeit-Periodisierung fürs Lauftraining dieses Athleten Richtung '
  + 'Zielrennen. Rufe dieses Tool auf und folge dem zurückgegebenen Verfahren, wenn '
  + 'der Athlet aufs große Bild schaut – z. B. "Bin ich auf Kurs für mein Ziel?", '
  + '"Wie sollte mein Block bis zum Rennen aussehen?", "Was muss nach dem '
  + 'Zwischenrennen passieren?", Fragen zur Periodisierung, zu Trainingsphasen, zum '
  + 'Formtrend über Wochen/Monate, oder zur Frage, wie sich ein Coach-/Team-Plan zum '
  + 'eigenen Renn-Ziel verhält. Auch aufrufen bei einem monatlichen/periodischen '
  + 'Strategie-Check oder beim Nachdenken über den Gesamtbogen der Saison. Für die '
  + 'konkrete laufende Woche und Tagessteuerung stattdessen get_playbook_week '
  + 'aufrufen.'

/**
 * Das Onboarding (Issue #50) ist der einzige Verfahrenstext mit einem *engen* Auslöser:
 * Woche und Makro zielen auf ganze Themenfelder, dieses hier auf **einen Satz** — den
 * `ERSTKONTAKT_SATZ`, dessen Docblock die Begründung trägt. Deshalb steht hier
 * ausdrücklich auch, wann **nicht**.
 *
 * Der Planzustand taucht in der Beschreibung bewusst *nicht* als Auslöser auf: Beim
 * Auswählen eines Tools kennt das Modell ihn noch gar nicht, ein „wenn der Plan leer
 * ist" wäre also unprüfbar und übrig bliebe „bei Trainingsfragen" — genau die
 * Konkurrenz zum Wochenverfahren, die wir nicht wollen. Der zustandsabhängige Weg
 * läuft andersherum: Woche und Makro lesen den Plan und verweisen hierher.
 */
const VERFAHREN_ONBOARDING_BESCHREIBUNG =
  'Die einmalige Ersteinrichtung der Trainingssteuerung dieses Athleten: Interview zu '
  + 'Zielrennen und Form, Anlegen des Steuerungsplans, Erklärung von Steuerung und '
  + 'Dashboard. Rufe dieses Tool auf und folge dem zurückgegebenen Verfahren, wenn der '
  + `Athlet den Erstkontakt-Satz aus seiner Einrichtung schickt – „${ERSTKONTAKT_SATZ}" `
  + '– oder gleichbedeutend darum bittet, ihn einzurichten bzw. mit der Trainings'
  + 'steuerung anzufangen. Nicht aufrufen bei einer bloßen Begrüßung, bei allgemeinen '
  + 'Fragen zu diesem Connector und nicht bei gewöhnlichen Trainingsfragen – dafür sind '
  + 'get_playbook_week und get_playbook_season da; fehlt dem Athleten die Grundlage, '
  + 'schicken die beiden von sich aus hierher.'

function registerVerfahren(server: McpServer): void {
  server.registerTool(
    'get_playbook_week',
    { title: 'Arbeitsweise: Woche', description: VERFAHREN_WOCHE_BESCHREIBUNG, inputSchema: {} },
    () => text(verfahrenWoche),
  )

  server.registerTool(
    'get_playbook_season',
    { title: 'Arbeitsweise: Saison', description: VERFAHREN_MAKRO_BESCHREIBUNG, inputSchema: {} },
    () => text(verfahrenMakro),
  )

  server.registerTool(
    'get_playbook_onboarding',
    { title: 'Arbeitsweise: Einstieg', description: VERFAHREN_ONBOARDING_BESCHREIBUNG, inputSchema: {} },
    () => text(verfahrenOnboarding),
  )
}

/**
 * Der fertig registrierte MCP-Server für genau einen Request eines Athleten.
 *
 * Ohne `instructions`: Das Feld gibt es im Protokoll, aber claude.ai legt es dem
 * Modell nicht vor (im Spike zu ADR-0008 zweimal belegt). Es hier zu füllen sähe nach
 * einer Wirkung aus, die es nicht hat.
 */
export function buildMcpServer(kontext: McpKontext): McpServer {
  const server = new McpServer(
    { name: 'athlete-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  registerFinalSurge(server, kontext)
  registerGarmin(server, kontext)
  registerSteuerung(server, kontext)
  registerDashboard(server, kontext)
  registerVerfahren(server)

  return server
}
