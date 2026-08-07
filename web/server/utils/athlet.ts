import type { H3Event } from 'h3'

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

/**
 * Dieselbe Frage für den MCP-Endpunkt — mit einer anderen Antwortquelle: dem
 * **Bearer-Token** aus dem eigenen Authorization Server (Issue #43). Vorher stand die
 * Identität im Pfad (`/{pathsecret}/mcp`); jetzt ist `/mcp` für alle dieselbe URL.
 *
 * Geprüft hat das Token bereits der OAuthProvider vor Nitro (`worker/index.ts`). Was
 * hier ankommt, sind die entschlüsselten Props des Grants — und die tragen
 * ausschließlich die `userId` (siehe `grantProps.ts`). Nitro reicht die
 * `ExecutionContext` des Workers unter `event.context.cloudflare.context` durch; genau
 * daran hat der Provider sie gehängt.
 *
 * Bewusst eine eigene Funktion neben `resolveAthlet` statt einer mit Flag: Session und
 * Token sind zwei verschiedene Ausweise, und ein vertauschtes Argument wäre eine
 * stille Rechteausweitung.
 *
 * 401 statt 404, wenn nichts Brauchbares ankommt. Der Fall ist praktisch unerreichbar
 * — ohne gültiges Token kommt der Request gar nicht bis hierher —, aber die Aussage
 * ist die richtige: Es fehlt ein Ausweis, nicht eine Ressource.
 */
export function resolveMcpAthlet(event: H3Event): { userId: string; env: Env } {
  const kontext = event.context as {
    cloudflare?: { context?: { props?: unknown } }
  }

  const userId = userIdAusProps(kontext.cloudflare?.context?.props)
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Kein gültiges Token' })
  }

  return { userId, env: envOf(event) }
}
