import type { H3Event } from 'h3'
import { TenantResolver } from '@shared/tenantResolver'

/**
 * Wer fragt hier eigentlich? Der gemeinsame Kern der Mandantentrennung im Web-Target.
 *
 * Seit ADR-0007 kommt die Antwort aus der **Session**, nicht mehr aus einem Secret in
 * der URL: Ein Link ist keine Anmeldung mehr. Darauf setzen alle per-Athleten-Routes
 * auf — Steuerung (`resolveSteuerung`) wie Körperdaten (`resolveKoerperdaten`); ein
 * Ort für die Frage, weil eine falsche Antwort fremde Daten ausliefern würde.
 *
 * Ohne Session → 401, für jede Fläche dieselbe Semantik. Nicht 404 wie beim alten
 * View-Secret: „unbekanntes Secret" war eine Aussage über eine Ressource, „nicht
 * angemeldet" ist eine über den Aufrufer — und der Client soll daraufhin zur Anmeldung
 * schicken statt eine Fehlerseite zu zeigen.
 *
 * Die Bindings bleiben im Server und landen nie im Client-Bundle (ADR-0004).
 */
export async function resolveAthlet(
  event: H3Event,
): Promise<{ userId: string; env: Env }> {
  const { user } = await getUserSession(event)
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Nicht angemeldet' })
  }

  return { userId: user.userId, env: envOf(event) }
}

// Die Auflösung des MCP-Endpunkts geht **noch** über das Pfad-Secret: `/{pathsecret}/mcp`
// bleibt bis Issue #43 der Weg, auf dem Claude hereinkommt — erst dort tritt ein
// Bearer-Token aus dem eigenen Authorization Server an seine Stelle. Bis dahin sind es
// bewusst zwei getrennte Funktionen und nicht eine mit Flag; ein vertauschtes Argument
// wäre eine stille Rechteausweitung.
//
// Der Pfad geht ungeteilt in `TenantResolver.resolve`: dessen Muster `/{secret}/mcp`
// prüft die Route ein zweites Mal, unabhängig vom Nitro-Router.
export async function resolveMcpAthlet(
  event: H3Event,
): Promise<{ userId: string; env: Env }> {
  const env = envOf(event)

  const userId = await new TenantResolver(env.SESSION_KV).resolve(
    getRequestURL(event).pathname,
  )
  if (!userId) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return { userId, env }
}
