import type { AuthState } from '../../utils/authState'

/**
 * Anmeldung per Google (ADR-0007). Ein Pfad, drei Rollen im Ablauf:
 *
 * 1. Erster Aufruf, ohne `code` und ohne `state`: Autorisierungs-Zustand ins KV, dann
 *    Selbstaufruf mit dem opaken `state`.
 * 2. Zweiter Aufruf, mit `state`: der Handler von `nuxt-auth-utils` leitet zu Google.
 * 3. Callback, mit `code` und `state`: Zustand einlösen, Token tauschen, anmelden.
 *
 * Der Umweg über den eigenen Pfad in Schritt 1 ist nötig, weil der Google-Handler
 * `state` nicht selbst erzeugt, sondern aus der Query des eigenen Requests durchreicht
 * (`state: query.state || ''`) und im Callback über `getQuery(event).state` zurückgibt.
 * Warum der Zustand überhaupt ins KV gehört und nicht in ein Cookie, steht in
 * `utils/authState.ts` — kurz: Apple, `form_post`, `SameSite=Lax`. Google käme mit
 * einem Cookie aus; zwei Pfade wären teurer als der eine.
 *
 * Der Zustand wird **vor** dem Aufruf des Handlers eingelöst, nicht erst in
 * `onSuccess`. Sonst kostete ein Callback mit erfundenem `state` erst einen
 * Token-Tausch bei Google, bevor er abgewiesen würde.
 *
 * Der Login ist **nicht** die Kontoerstellung: Kennt das KV die Identität nicht,
 * geht es in die Invite-Fläche (siehe `utils/anmeldung.ts`).
 */

/** Der Handler des Callbacks; `zustand` ist bereits geprüft und entwertet. */
function callbackHandler(zustand: AuthState) {
  return defineOAuthGoogleEventHandler({
    onSuccess(event, { user }) {
      return anmeldenNachProviderLogin(
        event,
        {
          provider: 'google',
          sub: String(user.sub ?? ''),
          name: String(user.name ?? ''),
          email: String(user.email ?? ''),
        },
        zustand.redirectTo,
      )
    },

    onError(event, error) {
      return providerFehler(event, 'google', error)
    },
  })
}

/** Der Handler des Hinwegs; er leitet nur zu Google und reicht `state` durch. */
const weiterleitungsHandler = defineOAuthGoogleEventHandler({
  onSuccess(event) {
    // Unerreichbar: Dieser Handler wird nur ohne `code` aufgerufen, und dann bleibt
    // er im Redirect-Zweig. Der Callback läuft über `callbackHandler`.
    return providerFehler(event, 'google', 'unerwarteter Callback')
  },
  onError(event, error) {
    return providerFehler(event, 'google', error)
  },
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const kv = envOf(event).SESSION_KV

  if (!query.code) {
    if (query.state) {
      return weiterleitungsHandler(event)
    }

    const state = await putAuthState(kv, { redirectTo: sichererZielpfad(query.redirect) })
    return sendRedirect(event, `/auth/google?state=${encodeURIComponent(state)}`, 302)
  }

  const zustand = await takeAuthState(kv, query.state)
  if (!zustand) {
    // Unbekannter, abgelaufener oder bereits benutzter `state`.
    return providerFehler(event, 'google', 'ungültiger state')
  }

  return callbackHandler(zustand)(event)
})
