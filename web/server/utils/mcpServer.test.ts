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
    origin: 'https://dev.training.example.dev',
  }
}

/** Ein verbundener Client gegen einen frisch gebauten Server, wie im echten Request. */
async function verbinde() {
  const [clientSeite, serverSeite] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([
    client.connect(clientSeite),
    buildMcpServer(kontextOhneZugriff()).connect(serverSeite),
  ])
  return client
}

describe('buildMcpServer', () => {
  it('registriert genau die zehn Tools, in unveränderter Reihenfolge', async () => {
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
