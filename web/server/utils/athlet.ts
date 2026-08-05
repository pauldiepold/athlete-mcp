import type { H3Event } from 'h3'
import { TenantResolver } from '@shared/tenantResolver'

// Der gemeinsame Kern der Mandantentrennung im Web-Target (Issue #24): löst das
// View-Secret aus der URL server-seitig auf und liefert den Athleten samt Env.
// Darauf setzen alle per-Nutzer-Routes auf — Steuerung (resolveSteuerung) wie
// Körperdaten (resolveKoerperdaten). Ein Ort für das Secret→Nutzer-Mapping, weil
// ein falsches Mapping fremde Daten ausliefern würde; unbekanntes oder fehlendes
// Secret → 404, für jede Fläche dieselbe Semantik.
//
// Die Bindings bleiben im Server und landen nie im Client-Bundle (ADR-0004).
export async function resolveAthlet(
  event: H3Event,
): Promise<{ userId: string; env: Env }> {
  const env = event.context.cloudflare.env as unknown as Env
  const secret = getRouterParam(event, 'secret')!

  const userId = await new TenantResolver(env.SESSION_KV).resolveViewSecret(secret)
  if (!userId) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return { userId, env }
}

// Dieselbe Auflösung für den MCP-Endpunkt, aber über den **anderen** Secret-Namespace:
// `/{pathsecret}/mcp` gewährt vollen Schreibzugriff über alle Kontexte, `/{viewsecret}`
// nur die eigene Browser-Fläche (ADR-0003). Die Trennung ist der Grund, warum es hier
// zwei Funktionen gibt statt einer mit Flag — ein vertauschtes Argument wäre eine
// stille Rechteausweitung.
//
// Der Pfad geht bewusst ungeteilt in `TenantResolver.resolve`: dessen Muster
// `/{secret}/mcp` prüft die Route ein zweites Mal, unabhängig vom Nitro-Router.
export async function resolveMcpAthlet(
  event: H3Event,
): Promise<{ userId: string; env: Env }> {
  const env = event.context.cloudflare.env as unknown as Env

  const userId = await new TenantResolver(env.SESSION_KV).resolve(
    getRequestURL(event).pathname,
  )
  if (!userId) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return { userId, env }
}
