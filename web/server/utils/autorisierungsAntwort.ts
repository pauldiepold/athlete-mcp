/**
 * Die Rückleitung zum OAuth-Client, wenn eine Autorisierung **nicht** in einem Code
 * endet — weil der Athlet ablehnt oder weil die Anfrage nach der Client-Prüfung noch
 * scheitert (Issue #43).
 *
 * OAuth 2.1 will für diesen Fall keine Fehlerseite, sondern eine Antwort an derselben
 * Stelle, an der auch der Erfolg ankäme: der registrierten `redirect_uri` mit
 * `error`-Parametern. Nur so erfährt Claude, dass der Versuch beendet ist, statt auf
 * einen Callback zu warten, der nie kommt.
 *
 * **Nur für bereits validierte Redirect-URIs.** Der Provider gibt eine `redirectUri`
 * an einem `AuthorizationError` ausschließlich dann heraus, wenn Client und URI
 * geprüft sind; fehlt sie, wird lokal gerendert und ausdrücklich *nicht* umgeleitet.
 * Diese Funktion prüft deshalb nichts nach — sie formatiert nur. Wer sie mit einer
 * ungeprüften URI aufruft, baut sich eine offene Weiterleitung.
 *
 * Der Erfolgsfall braucht kein Gegenstück: Dort liefert `completeAuthorization` die
 * fertige URL.
 */

export interface AutorisierungsFehler {
  /** Der OAuth-Fehlercode, z. B. `access_denied`. */
  code: string
  /** Menschenlesbare Ergänzung; optional und bewusst knapp. */
  description?: string
  /** Claudes `state`, unverändert zurückgegeben — ohne ihn verwirft der Client. */
  state?: string
  /** Der Issuer dieses Authorization Servers (RFC 9207). */
  issuer?: string
}

/**
 * Baut die Fehler-Rückleitung. Eine vorhandene Query der Redirect-URI bleibt stehen;
 * leere Felder werden weggelassen statt leer gesetzt.
 */
export function autorisierungsFehlerUrl(
  redirectUri: string,
  fehler: AutorisierungsFehler,
): string {
  const url = new URL(redirectUri)

  url.searchParams.set('error', fehler.code)
  if (fehler.description) url.searchParams.set('error_description', fehler.description)
  if (fehler.state) url.searchParams.set('state', fehler.state)
  if (fehler.issuer) url.searchParams.set('iss', fehler.issuer)

  return url.toString()
}
