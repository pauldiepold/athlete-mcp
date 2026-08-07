import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import type { H3Event } from 'h3'

/**
 * Hat dieser Athlet den **Connector** in Claude eingerichtet (Issue #52)?
 *
 * Abgeleitet und nicht gemeldet: Es gibt kein Häkchen, das der Athlet selbst setzt.
 * Zwei Quellen zählen, und zwar **oder** (Issue #57):
 *
 * - der **Marker**, den der Freigabe-Handler beim Zustimmen schreibt — die schnelle,
 *   direkt gelesene Quelle;
 * - ein **Grant** des Athleten, gefunden über `listUserGrants`.
 *
 * Warum beides: Der Grant allein war zu langsam. `listUserGrants` ist ein `list` über
 * die Grant-Schlüssel, und `list` ist *eventually consistent* und geht am Edge-Cache
 * vorbei — der Haken erschien erst Minuten nach dem Freigeben, in der Praxis erst nach
 * der ersten Nachricht im Chat. Der Marker allein wiederum ginge an den Bestandskonten
 * vorbei: Die haben längst Grants, aber nie einen Marker geschrieben bekommen, und ihr
 * Schritt stünde wieder offen.
 *
 * Bewusst in Kauf genommen: Wer den Connector in Claude wieder entfernt, behält den
 * Haken. Die Einrichtung ist eine einmalige Reise, kein Live-Monitor.
 *
 * `limit: 1`, weil die Frage ein Ja/Nein ist: Wer drei Clients autorisiert hat, hat
 * denselben Schritt erledigt wie der mit einem. Die Liste selbst gehört einer
 * Verwaltungs-Fläche, nicht der Einrichtung.
 *
 * **Ohne Binding: nur der Marker.** Im `nuxt dev`-Server läuft der Wrapper aus
 * `worker/index.ts` nicht mit (siehe `shared/oauthProviderBinding.d.ts`) — dort
 * entsteht weder Grant noch Marker. Anders als bei `/authorize`, das ohne Provider
 * sinnlos wäre und deshalb 500 wirft, ist das hier keine Panne: Die Einrichtung soll
 * lokal benutzbar bleiben und zeigt dann eben den Schritt, der lokal tatsächlich nicht
 * getan werden kann.
 */

/** Nur, was hier gebraucht wird — damit der Test ohne KV-Attrappe auskommt. */
export interface ConnectorSpeicher {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

/** Dasselbe für den Provider: gelesen wird genau eine Methode. */
export type GrantLeser = Pick<OAuthHelpers, 'listUserGrants'>

/**
 * Der KV-Eintrag im Athleten-Bereich, den das Zustimmen setzt. Neben den Verbindungen
 * und nicht im Grant-Store: Der gehört dem Provider, dieser Marker der Einrichtung.
 */
export function connectorMarkerKey(userId: string): string {
  return `user:${userId}:connector`
}

/**
 * Den Marker setzen. Der Wert ist der Zeitpunkt der ersten Freigabe — für die Frage
 * selbst genügte jeder Inhalt, aber ein Zeitstempel beantwortet später „seit wann"
 * ohne zweiten Eintrag. Ohne Ablauf: Der Schritt ist erledigt und bleibt es.
 */
export async function merkeConnector(
  kv: ConnectorSpeicher,
  userId: string,
): Promise<void> {
  await kv.put(connectorMarkerKey(userId), new Date().toISOString())
}

export async function connectorEingerichtet({
  kv,
  provider,
  userId,
}: {
  kv: ConnectorSpeicher
  provider: GrantLeser | undefined
  userId: string
}): Promise<boolean> {
  // Der Marker zuerst: Er ist der schnelle Weg, und wer ihn hat, braucht das teure
  // `list` gar nicht.
  if (await kv.get(connectorMarkerKey(userId))) return true

  if (!provider) return false

  const { items } = await provider.listUserGrants(userId, { limit: 1 })
  return items.length > 0
}

export async function hatConnector(event: H3Event, userId: string): Promise<boolean> {
  const env = envOf(event)
  return connectorEingerichtet({
    kv: env.SESSION_KV,
    provider: env.OAUTH_PROVIDER,
    userId,
  })
}
