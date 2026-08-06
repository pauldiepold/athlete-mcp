import { leseVerbindungen } from '@shared/verbindungen'

/**
 * Der Zustand der Verbindungen des angemeldeten Athleten (Issue #44) — die Quelle für
 * die Einstellungen-Fläche **und** für den Hinweis auf dem Dashboard.
 *
 * Rein lesend und bewusst genau ein Endpunkt für beide: Der Hinweis oben auf dem
 * Dashboard und die Karten in den Einstellungen sollen nie Verschiedenes behaupten.
 *
 * Was zurückkommt, ist Anzeige-Material — Zustand, Name, Fehlermeldung. Zugangsdaten,
 * Tokens und KV-Schlüsselnamen verlassen den Server nicht.
 */
export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)

  return { verbindungen: await leseVerbindungen(env.SESSION_KV, userId) }
})
