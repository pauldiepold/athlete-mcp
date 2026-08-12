import type { AuthState } from '../../utils/authState'

/**
 * Anmeldung per Google (ADR-0007). Ein Pfad, zwei Rollen im Ablauf:
 *
 * 1. Aufruf ohne `code`: Nutzlast ins KV, Handle ins Cookie, dann leitet der Handler
 *    von `nuxt-auth-utils` zu Google.
 * 2. Callback mit `code`: Nutzlast einlösen, Token tauschen, anmelden.
 *
 * Den `state` besitzt seit 0.5.30 die Bibliothek — sie erzeugt ihn, bindet ihn per
 * Cookie an den Browser und prüft ihn, bevor sie den Code eintauscht
 * (GHSA-xc49-mgwh-9pjv). Der frühere Selbstaufruf über `/auth/google?state=…` ist
 * damit hinfällig: Er existierte nur, um unseren eigenen `state` in die Query zu
 * bekommen, die der Handler durchreichte. Heute überschriebe die Bibliothek ihn.
 *
 * Unsere Nutzlast reist deshalb über ein eigenes Cookie (`utils/authState.ts`). Sie
 * wird **vor** dem Aufruf des Handlers eingelöst, nicht erst in `onSuccess`: ein
 * Callback ohne gültiges Handle soll keinen Token-Tausch bei Google kosten.
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

/** Der Handler des Hinwegs; er leitet nur zu Google. */
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
    const handle = await putAuthState(kv, { redirectTo: sichererZielpfad(query.redirect) })
    // `lax` reicht: Googles Callback ist ein GET auf unsere eigene Origin. Damit bleibt
    // der Hinweg auch über `http://localhost` gangbar, wo ein `secure`-Cookie stört.
    setzeAuthStateCookie(event, handle, 'lax')
    return weiterleitungsHandler(event)
  }

  const zustand = await takeAuthState(kv, nimmAuthStateCookie(event))
  if (!zustand) {
    // Unbekanntes, abgelaufenes oder bereits benutztes Handle.
    return providerFehler(event, 'google', 'ungültiger state')
  }

  return callbackHandler(zustand)(event)
})
