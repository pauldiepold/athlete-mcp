import type { H3Event } from 'h3'

/**
 * Hat dieser Athlet den **Connector** in Claude eingerichtet (Issue #52)?
 *
 * Abgeleitet aus den *Grants* des Athleten, nicht gemeldet: Ein Grant ist die
 * Zustimmung, die beim Hinzufügen des Connectors entsteht — mehr Beweis für „ist
 * eingerichtet" gibt es nicht und braucht es nicht. Ein Häkchen, das der Athlet selbst
 * setzt, stünde daneben und wäre falsch, sobald er den Connector wieder entfernt.
 *
 * `limit: 1`, weil die Frage ein Ja/Nein ist: Wer drei Clients autorisiert hat, hat
 * denselben Schritt erledigt wie der mit einem. Die Liste selbst gehört einer
 * Verwaltungs-Fläche, nicht der Einrichtung.
 *
 * **Ohne Binding: `false`.** Im `nuxt dev`-Server läuft der Wrapper aus
 * `worker/index.ts` nicht mit (siehe `shared/oauthProviderBinding.d.ts`) — dort gibt
 * es keine Grants und also auch keinen eingerichteten Connector. Anders als bei
 * `/authorize`, das ohne Provider sinnlos wäre und deshalb 500 wirft, ist das hier
 * keine Panne: Die Einrichtung soll lokal benutzbar bleiben und zeigt dann eben den
 * Schritt, der lokal tatsächlich nicht getan werden kann.
 */
export async function hatConnector(event: H3Event, userId: string): Promise<boolean> {
  const provider = envOf(event).OAUTH_PROVIDER
  if (!provider) return false

  const { items } = await provider.listUserGrants(userId, { limit: 1 })
  return items.length > 0
}
