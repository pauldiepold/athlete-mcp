import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import { buildMcpServer } from './mcpServer'
import type { McpKontext } from './mcpServer'

/**
 * Der Vertrag, den der Athlet in Claude sieht: **welche** Tools es gibt, wie sie
 * heißen und welche Argumente sie verlangen.
 *
 * Diese Liste ist der Grund für den Test. Beim Umzug aus dem Durable Object in die
 * Nitro-Route (ADR-0007) wurde jede Registrierung von Hand übertragen — ein dabei
 * verlorenes Tool oder ein verrutschtes Pflichtfeld hätte sich erst gezeigt, wenn ein
 * Skill im Chat ins Leere greift. Die Beschreibungstexte sind bewusst nicht
 * mitgeprüft: sie sind Prosa und dürfen sich ändern, ohne dass ein Test bricht.
 */
const ERWARTETE_TOOLS = [
  { name: 'get_planned_workouts', required: ['start_date', 'end_date'] },
  { name: 'get_upcoming_workouts', required: [] },
  { name: 'get_koerperdaten', required: ['date'] },
  { name: 'get_koerperdaten_range', required: ['start_date', 'end_date'] },
  { name: 'get_steuerungsplan', required: [] },
  { name: 'set_steuerungsplan', required: ['content'] },
  { name: 'list_wochen', required: [] },
  { name: 'get_woche', required: ['kw'] },
  { name: 'set_woche', required: ['kw', 'content'] },
  { name: 'get_dashboard_link', required: [] },
  { name: 'get_verfahren_woche', required: [] },
  { name: 'get_verfahren_makro', required: [] },
]

/**
 * Ein Kontext, dessen Bindings beim Zugriff auffliegen. Der Server wird pro Request
 * gebaut und darf dabei **nichts** abrufen — sonst kostete schon `tools/list` einen
 * KV- und D1-Zugriff pro Aufruf.
 */
function kontextOhneZugriff(): McpKontext {
  const explodiert = new Proxy(
    {},
    {
      get() {
        throw new Error('Bindings beim Bauen des Servers berührt')
      },
    },
  )
  return {
    userId: 'paul',
    kv: explodiert as KVNamespace,
    db: explodiert as D1Database,
    origin: ORIGIN,
  }
}

const ORIGIN = 'https://dev.training.example.dev'

/** Ein verbundener Client gegen einen frisch gebauten Server, wie im echten Request. */
async function verbinde(kontext: McpKontext = kontextOhneZugriff()) {
  const [clientSeite, serverSeite] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([
    client.connect(clientSeite),
    buildMcpServer(kontext).connect(serverSeite),
  ])
  return client
}

/**
 * Ein Kontext ohne jede eingerichtete Verbindung — der Zustand eines Athleten, der
 * gerade seinen Invite-Code eingelöst hat. D1 bleibt der explodierende Proxy: Die
 * Tools der beiden Datenquellen dürfen dort gar nicht erst ankommen.
 */
function kontextOhneVerbindungen(): McpKontext {
  const leeresKv = {
    async get() {
      return null
    },
    async put() {},
    async delete() {},
  }
  return { ...kontextOhneZugriff(), kv: leeresKv as unknown as KVNamespace }
}

/** Die Textblöcke einer Tool-Antwort, zusammengezogen. */
function textVon(ergebnis: unknown): string {
  const { content } = ergebnis as { content: { type: string; text?: string }[] }
  return content.map((block) => block.text ?? '').join('\n')
}

describe('buildMcpServer', () => {
  it('registriert genau die zwölf Tools, in unveränderter Reihenfolge', async () => {
    const { tools } = await (await verbinde()).listTools()

    expect(tools.map((t) => t.name)).toEqual(ERWARTETE_TOOLS.map((t) => t.name))
  })

  it('verlangt je Tool genau die erwarteten Pflichtargumente', async () => {
    const { tools } = await (await verbinde()).listTools()

    for (const { name, required } of ERWARTETE_TOOLS) {
      const tool = tools.find((t) => t.name === name)!
      expect(tool.inputSchema.required ?? [], name).toEqual(required)
    }
  })

  it('gibt jedem Tool eine Beschreibung mit (ohne die entscheidet das Modell blind)', async () => {
    const { tools } = await (await verbinde()).listTools()

    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy()
    }
  })

  it('rührt beim Bauen weder KV noch D1 an', async () => {
    // Der Proxy im Kontext wirft bei jedem Zugriff — dass hier nichts fliegt, ist
    // die Zusicherung. `initialize` und `tools/list` kommen ohne I/O aus.
    await expect(verbinde()).resolves.toBeDefined()
  })
})

/**
 * Die Verfahren als Tool-Antwort (ADR-0008).
 *
 * Der Athlet lädt keinen Skill mehr hoch — der Connector liefert die Arbeitsweise
 * selbst aus. Damit hängt alles an zwei Dingen: dass der Text überhaupt ankommt, und
 * dass die `description` die Auslöser trägt, an denen das Modell erkennt, *wann* es
 * zugreift. Beides ist hier festgenagelt.
 */
describe('Verfahrens-Tools', () => {
  const VERFAHREN = [
    { name: 'get_verfahren_woche', ueberschrift: '# Verfahren: Wochensteuerung' },
    { name: 'get_verfahren_makro', ueberschrift: '# Verfahren: Makroperiodisierung' },
  ]

  for (const { name, ueberschrift } of VERFAHREN) {
    it(`${name} liefert seinen Markdown-Text`, async () => {
      const client = await verbinde()

      const antwort = textVon(await client.callTool({ name, arguments: {} }))

      expect(antwort.startsWith(ueberschrift), antwort.slice(0, 80)).toBe(true)
      expect(antwort.length).toBeGreaterThan(1000)
    })

    it(`${name} kommt ohne KV und D1 aus — reiner Text`, async () => {
      // Der Kontext ist der explodierende Proxy: Ein Verfahren ist Arbeitsweise, kein
      // Athleten-Fakt, und darf deshalb nichts nachschlagen.
      const ergebnis = await (await verbinde()).callTool({ name, arguments: {} })

      expect(ergebnis.isError).toBeFalsy()
    })

    it(`${name} nennt weder tool_search noch deferred Tools noch eine eigene MCP-URL`, async () => {
      // Claude-Code-Mechanik, die es im claude.ai-Chat nicht gibt, und die seit
      // ADR-0007 falsche Behauptung, jeder Athlet habe seine eigene Adresse.
      const client = await verbinde()
      const tool = (await client.listTools()).tools.find((t) => t.name === name)!

      const text = textVon(await client.callTool({ name, arguments: {} }))
        + '\n' + tool.description

      expect(text).not.toContain('tool_search')
      expect(text).not.toContain('deferred')
      expect(text).not.toContain('eigene URL')
    })
  }

  it('trennt in den Beschreibungen Woche von Makro', async () => {
    // Die einzige Stelle, an der das Modell die beiden auseinanderhält.
    const { tools } = await (await verbinde()).listTools()
    const beschreibung = (name: string) => tools.find((t) => t.name === name)!.description!

    expect(beschreibung('get_verfahren_woche')).toContain('Was steht heute')
    expect(beschreibung('get_verfahren_woche')).toContain('get_verfahren_makro')
    expect(beschreibung('get_verfahren_makro')).toContain('auf Kurs für mein Ziel')
    expect(beschreibung('get_verfahren_makro')).toContain('get_verfahren_woche')
  })

  it('interviewt im Wochenverfahren nicht selbst, sondern verweist aufs Onboarding', async () => {
    // Ein leerer Steuerungsplan ist das Signal „noch nicht onboarded" — dafür gibt es
    // ein eigenes Verfahren (Issue #50), nicht eine zweite Fassung desselben Interviews.
    const text = textVon(
      await (await verbinde()).callTool({ name: 'get_verfahren_woche', arguments: {} }),
    )

    expect(text).toContain('Onboarding')
    expect(text).not.toContain('Kurzes Interview')
  })
})

/**
 * Was passiert, solange eine Datenquelle nicht verbunden ist (Issue #44).
 *
 * Der Zustand ist beim ersten Gespräch der Normalfall — ein Konto entsteht durch einen
 * Invite-Code, die Verbindungen richtet der Athlet danach selbst ein. Claude soll das
 * fachlich mitteilen und den Weg dorthin weiterreichen, statt eine Fehlermeldung zu
 * produzieren, an der beide hängenbleiben.
 */
describe('Tools ohne eingerichtete Verbindung', () => {
  const OHNE_VERBINDUNG = [
    { name: 'get_planned_workouts', args: { start_date: '2026-08-01', end_date: '2026-08-07' } },
    { name: 'get_upcoming_workouts', args: {} },
    { name: 'get_koerperdaten', args: { date: '2026-08-01' } },
    { name: 'get_koerperdaten_range', args: { start_date: '2026-08-01', end_date: '2026-08-07' } },
  ]

  it('bleiben alle registriert — ohne SSE gäbe es kein Nachreichen', async () => {
    // Eine später hergestellte Verbindung würde in Claudes gecachter Werkzeugliste nie
    // auftauchen; der Athlet müsste seinen Connector neu einrichten.
    const { tools } = await (await verbinde(kontextOhneVerbindungen())).listTools()

    expect(tools.map((t) => t.name)).toEqual(ERWARTETE_TOOLS.map((t) => t.name))
  })

  for (const { name, args } of OHNE_VERBINDUNG) {
    it(`${name} antwortet fachlich mit dem Einrichtungs-Link, ohne isError`, async () => {
      const client = await verbinde(kontextOhneVerbindungen())

      const ergebnis = await client.callTool({ name, arguments: args })

      expect(ergebnis.isError, name).toBeFalsy()
      expect(textVon(ergebnis)).toContain(`${ORIGIN}/einstellungen`)
    })

    it(`${name} nennt dabei keine internen Schlüsselnamen`, async () => {
      const client = await verbinde(kontextOhneVerbindungen())

      const antwort = textVon(await client.callTool({ name, arguments: args }))

      expect(antwort).not.toContain('user:')
      expect(antwort).not.toContain('KV')
      expect(antwort).not.toContain('paul')
    })
  }

  it('nennt die Datenquelle beim Namen, den der Athlet kennt', async () => {
    const client = await verbinde(kontextOhneVerbindungen())

    expect(
      textVon(await client.callTool({ name: 'get_upcoming_workouts', arguments: {} })),
    ).toContain('Final Surge')
    expect(
      textVon(await client.callTool({ name: 'get_koerperdaten', arguments: { date: '2026-08-01' } })),
    ).toContain('Garmin')
  })

  it('lässt die Steuerung unberührt — sie braucht keine externe Verbindung', async () => {
    // Der Grund, warum es kein Alles-oder-Nichts-Tor gibt: Die Steuerung ist ab
    // Sekunde eins nutzbar, auch wenn noch gar nichts verbunden ist.
    const client = await verbinde(kontextOhneVerbindungen())

    const ergebnis = await client.callTool({ name: 'list_wochen', arguments: {} })

    // D1 ist im Kontext der explodierende Proxy: Dass dieser Aufruf *überhaupt*
    // dorthin durchgeht, ist die Aussage — er wird von keinem Verbindungs-Tor
    // abgefangen.
    expect(ergebnis.isError).toBe(true)
    expect(textVon(ergebnis)).toContain('Bindings')
  })

  it('get_dashboard_link trägt den Einrichtungs-Link', async () => {
    const client = await verbinde(kontextOhneVerbindungen())

    const antwort = textVon(
      await client.callTool({ name: 'get_dashboard_link', arguments: {} }),
    )

    expect(antwort).toContain(`${ORIGIN}/einstellungen`)
    expect(antwort).toContain(`${ORIGIN}/steuerung`)
  })
})
