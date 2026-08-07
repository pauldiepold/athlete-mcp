/**
 * Der MCP-Endpunkt — seit ADR-0007 eine Nitro-Route dieses Deployables statt eines
 * eigenen Workers mit Durable Object.
 *
 * **Stateless Streamable HTTP** (Spike #37): `sessionIdGenerator: undefined` schaltet
 * die Sitzungsverwaltung ab, `enableJsonResponse: true` lässt den Transport eine
 * gewöhnliche JSON-Antwort statt eines SSE-Streams schreiben. Server *und* Transport
 * entstehen pro Request neu — ein stateless Transport darf ausdrücklich nicht über
 * Requests hinweg wiederverwendet werden, sonst kollidieren die Message-IDs
 * verschiedener Clients.
 *
 * Was dadurch entfällt: der Durable Object (er hielt bei `McpAgent` nur
 * MCP-*Session*-Zustand — SSE-Resumability und server-initiierte Notifications), das
 * SSE-GET und jeder selbst geschriebene JSON-RPC-Handler. Alle zehn Tools sind reine
 * Request/Response-Aufrufe gegen KV und D1; keiner braucht davon etwas. Preis: keine
 * langlaufenden Tools mit Progress-Updates, ohne den DO zurückzuholen.
 *
 * **Eine URL für alle** (Issue #43): Der Pfad trägt seit dem eigenen
 * Authorization Server keine Identität mehr. Wer fragt, sagt das Bearer-Token — die
 * Token-Prüfung liegt im OAuthProvider vor dieser Route (`worker/index.ts`), der
 * aufgelöste Athlet kommt als Grant-`props` an (`resolveMcpAthlet`).
 */

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

export default defineEventHandler(async (event) => {
  // Nur POST. Der Transport würde ein GET **nicht** abweisen, sondern einen
  // SSE-Stream öffnen und offen halten — auch stateless, wo darüber nie etwas käme.
  // Das wäre genau das SSE-GET, das mit dem Durable Object weggefallen ist: eine
  // dauerhaft offene Verbindung samt Keep-alive-Timer für nichts. Die Spec sieht für
  // Server ohne SSE-Stream 405 vor; DELETE (Sitzung beenden) fällt mangels Sitzung
  // ebenfalls darunter.
  if (event.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { allow: 'POST' },
    })
  }

  const { userId, env } = resolveMcpAthlet(event)

  const server = buildMcpServer({
    userId,
    kv: env.SESSION_KV,
    db: env.ATHLETE_DB,
    origin: requestOrigin(event),
  })

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  await server.connect(transport)

  // `toWebRequest` statt `event.req`: Nitro 2.13 fährt intern h3 v1, dessen `req` ein
  // Node-artiges Objekt mit einfachem `headers`-Record ist. Der Transport erwartet
  // einen echten Web-Request und ruft `headers.get(…)` — ohne diese Umwandlung
  // scheitert schon das Parsen jeder Nachricht.
  return transport.handleRequest(toWebRequest(event))
})
