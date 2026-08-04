/**
 * SPIKE #37 — Checkpoint 1: MCP stateless in der Workers-Runtime, ohne Durable Object.
 *
 * Wegwerf-Code. Ein Dummy-Tool, ein POST-Handler, kein SSE-GET, keine Session.
 *
 * Der Transport ist NICHT der Node-gebundene `StreamableHTTPServerTransport`,
 * sondern `WebStandardStreamableHTTPServerTransport` (MCP-SDK >= 1.28): Request/
 * Response statt IncomingMessage/ServerResponse, vom SDK ausdrücklich für
 * Cloudflare Workers vorgesehen. Damit entfällt die im Issue befürchtete
 * unenv-Shim-Falle komplett.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

export interface SpikeProps {
  userId: string
  displayName: string
}

/**
 * Baut Server + Transport pro Request neu auf. In stateless Streamable HTTP ist
 * das der vorgesehene Weg — es gibt keinen Zustand, der einen Request überdauert.
 */
async function handleMcp(request: Request, props?: SpikeProps): Promise<Response> {
  const server = new McpServer(
    { name: 'athlete-mcp-spike', version: '0.0.0' },
    { capabilities: { tools: {} } },
  )

  server.registerTool(
    'spike_ping',
    {
      title: 'Spike Ping',
      description: 'Dummy-Tool des Spikes. Gibt zurück, wer authentifiziert ist.',
      inputSchema: { text: z.string().describe('Beliebiger Text') },
    },
    async ({ text }) => ({
      content: [
        {
          type: 'text' as const,
          text: props
            ? `pong: ${text} (userId=${props.userId}, displayName=${props.displayName})`
            : `pong: ${text} (unauthenticated)`,
        },
      ],
    }),
  )

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true, // JSON statt SSE-Stream zurückgeben
  })

  await server.connect(transport)
  return transport.handleRequest(request)
}

/** Als eigenständiger Worker deploybar (Checkpoint 1) und als apiHandler nutzbar (Checkpoint 2). */
export const mcpHandler = {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/mcp')) {
      return new Response('Not found', { status: 404 })
    }
    return handleMcp(request)
  },
}

export default mcpHandler
export { handleMcp }
