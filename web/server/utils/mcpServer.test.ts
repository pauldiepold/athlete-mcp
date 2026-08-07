import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import { PRODUKTNAME } from '@shared/produkt'
import { STARTSATZ } from '@shared/steuerung/startsatz'

import { buildMcpServer } from './mcpServer'
import type { McpKontext } from './mcpServer'

/**
 * Der Vertrag, den der Athlet in Claude sieht: **welche** Tools es gibt, wie sie
 * heißen, wie sie im Chat angezeigt werden und welche Argumente sie verlangen.
 *
 * Diese Liste ist der Grund für den Test. Beim Umzug aus dem Durable Object in die
 * Nitro-Route (ADR-0007) wurde jede Registrierung von Hand übertragen — ein dabei
 * verlorenes Tool oder ein verrutschtes Pflichtfeld hätte sich erst gezeigt, wenn ein
 * Skill im Chat ins Leere greift. Die Beschreibungstexte sind bewusst nicht
 * mitgeprüft: sie sind Prosa und dürfen sich ändern, ohne dass ein Test bricht.
 *
 * Namen und Titel dagegen schon (Issue #58): Der **Name** ist Prompt-Material, an dem
 * das Modell auswählt, und er ist durchgängig englisch — eine halb übersetzte Liste
 * liest sich wie zwei Server. Das **`title`** ist, was der Athlet im Chat sieht, und
 * damit durchgängig deutsch. Beides ist außerdem festgenagelt, weil eine Umbenennung
 * ohne `tools/list_changed` (kein Durable Object) jeden Athleten zwingt, seinen
 * Connector neu einzurichten.
 */
const ERWARTETE_TOOLS = [
  { name: 'get_planned_workouts', title: 'Coach-Plan (Zeitraum)', required: ['start_date', 'end_date'] },
  { name: 'get_upcoming_workouts', title: 'Coach-Plan (nächste Tage)', required: [] },
  { name: 'get_body_metrics', title: 'Körperdaten (Tag)', required: ['date'] },
  { name: 'get_body_metrics_range', title: 'Körperdaten (Zeitraum)', required: ['start_date', 'end_date'] },
  { name: 'get_training_profile', title: 'Grundlagen lesen', required: [] },
  { name: 'set_training_profile', title: 'Grundlagen schreiben', required: ['content'] },
  { name: 'list_weeks', title: 'Wochen auflisten', required: [] },
  { name: 'get_week', title: 'Woche lesen', required: ['kw'] },
  { name: 'set_week', title: 'Woche schreiben', required: ['kw', 'content'] },
  { name: 'get_web_links', title: 'Links zur Weboberfläche', required: [] },
  { name: 'get_playbook_week', title: 'Arbeitsweise: Woche', required: [] },
  { name: 'get_playbook_season', title: 'Arbeitsweise: Saison', required: [] },
  { name: 'get_playbook_onboarding', title: 'Arbeitsweise: Einstieg', required: [] },
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
  it('meldet sich unter dem Produktnamen', async () => {
    // Der `name` des Servers ist das, was Claude in seiner Connector-Liste zeigt
    // (Issue #59) — die einzige Stelle, an der der Athlet den Server benennen sieht.
    // `athlete-mcp` stand hier bis dahin und bedeutete ihm nichts.
    expect((await verbinde()).getServerVersion()?.name).toBe(PRODUKTNAME)
  })

  it('registriert genau die erwarteten Tools, in unveränderter Reihenfolge', async () => {
    const { tools } = await (await verbinde()).listTools()

    expect(tools.map((t) => t.name)).toEqual(ERWARTETE_TOOLS.map((t) => t.name))
  })

  it('zeigt je Tool den erwarteten deutschen Titel', async () => {
    // Der Name trägt die Auswahl des Modells, der Titel das, was der Athlet liest.
    const { tools } = await (await verbinde()).listTools()

    for (const { name, title } of ERWARTETE_TOOLS) {
      expect(tools.find((t) => t.name === name)!.title, name).toBe(title)
    }
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
    { name: 'get_playbook_week', ueberschrift: '# Verfahren: Wochensteuerung' },
    { name: 'get_playbook_season', ueberschrift: '# Verfahren: Makroperiodisierung' },
    { name: 'get_playbook_onboarding', ueberschrift: '# Verfahren: Onboarding' },
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

    expect(beschreibung('get_playbook_week')).toContain('Was steht heute')
    expect(beschreibung('get_playbook_week')).toContain('get_playbook_season')
    expect(beschreibung('get_playbook_season')).toContain('auf Kurs für mein Ziel')
    expect(beschreibung('get_playbook_season')).toContain('get_playbook_week')
  })

  it('trennt den Einstieg von beiden — er zielt auf den Startsatz', async () => {
    // Die `description` ist die einzige Stelle, an der das Modell erkennt, wann dieses
    // Tool dran ist. Sie muss auf den einen Satz zielen, den die Einrichtung zum
    // Kopieren anbietet — ein Einstieg, der bei jedem „Hallo" anspringt, wäre für
    // alle anderen eine Plage.
    const { tools } = await (await verbinde()).listTools()
    const beschreibung = tools.find((t) => t.name === 'get_playbook_onboarding')!.description!

    expect(beschreibung).toContain(STARTSATZ)
    expect(beschreibung).toContain('Nicht aufrufen')
    // Und es verweist die gewöhnlichen Trainingsfragen weiter, statt mit den beiden
    // laufenden Verfahren um sie zu konkurrieren.
    expect(beschreibung).toContain('get_playbook_week')
    expect(beschreibung).toContain('get_playbook_season')
  })

  it('interviewt im Wochenverfahren nicht selbst, sondern verweist auf den Einstieg', async () => {
    // Ein leerer Steuerungsplan ist das Signal „noch kein Trainingsbuch" — dafür gibt es
    // ein eigenes Verfahren (Issue #50), nicht eine zweite Fassung desselben Interviews.
    //
    // Geprüft wird der **Tool-Name** und nicht das Wort „Onboarding": Das ist seit
    // Issue #59 Repo-Sprache und darf aus dem Verfahrenstext verschwinden — der
    // Verweis selbst darf es nicht.
    const text = textVon(
      await (await verbinde()).callTool({ name: 'get_playbook_week', arguments: {} }),
    )

    expect(text).toContain('get_playbook_onboarding')
    expect(text).not.toContain('Kurzes Interview')
  })
})

/**
 * Das Onboarding-Verfahren (Issue #50) — der Weg vom leeren Store zum Steuerungsplan.
 *
 * Der Text ist Prosa und darf sich ändern; festgenagelt sind hier nur die Zusagen, die
 * das Verfahren überhaupt erst tragfähig machen: dass es den Zustand liest statt ihn zu
 * erfragen, dass es **nie** nach Zugangsdaten fragt, dass am Ende ein Steuerungsplan im
 * Store steht und dass es in einen neuen Chat übergibt.
 */
describe('Verfahren: Onboarding', () => {
  const onboarding = async () =>
    textVon(
      await (await verbinde()).callTool({
        name: 'get_playbook_onboarding',
        arguments: {},
      }),
    )

  it('liest den Verbindungs- und Planzustand über die vorhandenen Tools', async () => {
    const text = await onboarding()

    expect(text).toContain('get_training_profile')
    expect(text).toContain('get_body_metrics_range')
    expect(text).toContain('get_upcoming_workouts')
    expect(text).toContain('get_web_links')
  })

  it('fragt unter keinen Umständen nach Zugangsdaten, sondern verlinkt in die Einstellungen', async () => {
    // Passwörter und MFA-Codes gehören ausschließlich in die Weboberfläche. Das ist
    // eine Invariante des Verfahrens, keine Empfehlung — deshalb steht sie hier.
    const text = await onboarding()

    expect(text).toContain('Niemals nach Zugangsdaten')
    expect(text).toContain('/einstellungen')
  })

  it('führt das inhaltliche Interview, das im Wochenverfahren entfallen ist', async () => {
    const text = await onboarding()

    for (const frage of ['Zielrennen', 'Zielzeit', 'Coach', 'Form', 'Baseline', 'Phase']) {
      expect(text, frage).toContain(frage)
    }
  })

  it('schreibt am Ende einen Starter-Steuerungsplan — sein Vorhandensein ist das Fertig-Signal', async () => {
    const text = await onboarding()

    expect(text).toContain('set_training_profile')
    expect(text).toContain('Fertig-Signal')
  })

  it('erklärt Steuerung und Dashboard samt Körperdaten-Index', async () => {
    const text = await onboarding()

    expect(text).toContain('Körperdaten-Index')
    // ADR-0006: der Index ist das Rohmaterial der Tagesform, nicht sie selbst. Wer
    // beide Namen synonym benutzt, hat den ADR nicht gelesen.
    expect(text).not.toContain('Tagesform-Index')
  })

  it('übergibt in einen neuen Chat — außer Garmin liefert noch keine Daten', async () => {
    const text = await onboarding()

    expect(text).toContain('neuen Chat')
    expect(text).toContain('get_playbook_week')
    expect(text).toContain('Erstbefüllung')
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
    { name: 'get_body_metrics', args: { date: '2026-08-01' } },
    { name: 'get_body_metrics_range', args: { start_date: '2026-08-01', end_date: '2026-08-07' } },
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
      textVon(await client.callTool({ name: 'get_body_metrics', arguments: { date: '2026-08-01' } })),
    ).toContain('Garmin')
  })

  it('lässt die Steuerung unberührt — sie braucht keine externe Verbindung', async () => {
    // Der Grund, warum es kein Alles-oder-Nichts-Tor gibt: Die Steuerung ist ab
    // Sekunde eins nutzbar, auch wenn noch gar nichts verbunden ist.
    const client = await verbinde(kontextOhneVerbindungen())

    const ergebnis = await client.callTool({ name: 'list_weeks', arguments: {} })

    // D1 ist im Kontext der explodierende Proxy: Dass dieser Aufruf *überhaupt*
    // dorthin durchgeht, ist die Aussage — er wird von keinem Verbindungs-Tor
    // abgefangen.
    expect(ergebnis.isError).toBe(true)
    expect(textVon(ergebnis)).toContain('Bindings')
  })

  it('get_web_links trägt den Einrichtungs-Link', async () => {
    const client = await verbinde(kontextOhneVerbindungen())

    const antwort = textVon(
      await client.callTool({ name: 'get_web_links', arguments: {} }),
    )

    expect(antwort).toContain(`${ORIGIN}/einstellungen`)
    expect(antwort).toContain(`${ORIGIN}/steuerung`)
  })
})

/**
 * `get_web_links` liefert **benannte Felder** (Issue #58).
 *
 * Der frühere Name versprach einen Link, es waren immer mehrere. Die Verfahrenstexte
 * schicken den Athleten mal in die Einstellungen, mal auf die Steuerung — über einen
 * Feldnamen greifen sie genau den, den sie meinen, statt ihn aus einer Aufzählung
 * herauszulesen.
 *
 * Seit Issue #60 sind es fünf: Startseite und Verläufe liegen nicht mehr auf derselben
 * Adresse.
 */
describe('get_web_links', () => {
  it('antwortet mit einem JSON-Objekt, dessen Felder die fünf Flächen benennen', async () => {
    const antwort = textVon(
      await (await verbinde()).callTool({ name: 'get_web_links', arguments: {} }),
    )

    expect(JSON.parse(antwort)).toEqual({
      start: `${ORIGIN}/`,
      dashboard: `${ORIGIN}/dashboard`,
      steuerung: `${ORIGIN}/steuerung`,
      tagVorlage: `${ORIGIN}/tag/YYYY-MM-DD`,
      einrichtung: `${ORIGIN}/einstellungen`,
    })
  })
})
