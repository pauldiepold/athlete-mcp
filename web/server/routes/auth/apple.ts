/**
 * Anmeldung per Apple (ADR-0007). Kein `.get`-Suffix im Dateinamen: Apple antwortet
 * ausschließlich mit `response_mode=form_post`, der Callback ist also ein **POST** auf
 * denselben Pfad, über den der Login startet.
 *
 * Den CSRF-Schutz besitzt seit `nuxt-auth-utils` 0.5.30 die Bibliothek: Sie sendet
 * jetzt auch bei Apple einen eigenen `state` und prüft ihn, und sie setzt ihr
 * state-Cookie dafür auf `sameSite: 'none'` — sonst überlebte es den cross-site
 * `form_post` nicht (GHSA-xc49-mgwh-9pjv). Früher sendete der Apple-Handler **kein**
 * `state`, und der KV-Zustand musste diese Rolle mit übernehmen; er ist heute nur noch
 * Transport der Nutzlast (siehe `utils/authState.ts`). Ein eigener `state` in
 * `authorizationParams` käme ohnehin nicht mehr durch — der Handler überschreibt ihn.
 *
 * Das Handle der Nutzlast wird trotzdem **vor** dem Token-Tausch eingelöst: Ein
 * Callback ohne gültiges Handle soll keinen Request an Apple kosten.
 *
 * Der Handler wird **pro Request** instanziiert. `defineOAuthAppleEventHandler`
 * überschreibt seine eigene Closure-Variable `config` beim ersten Aufruf
 * (`config = defu(config, …)`); außerdem braucht der Callback-Zweig die eingelöste
 * Nutzlast in seiner `onSuccess`.
 *
 * Die Unterscheidung Hinweg/Callback läuft über denselben strikten Vergleich des
 * `content-type`, den die Bibliothek intern benutzt. Ein Präfix-Vergleich wäre für
 * sich robuster, würde hier aber gerade den Schaden anrichten: Wichen die beiden
 * Urteile auseinander, löste diese Route ein Handle ein, während die Bibliothek den
 * Request als Hinweg behandelt. Gleich streng ist richtiger als für sich robust.
 *
 * Zwei weitere Apple-Eigenheiten, die sonst Zeit kosten:
 * - `redirectURL` **muss** explizit gesetzt sein (`NUXT_OAUTH_APPLE_REDIRECT_URL`).
 *   Im Redirect-Zweig fällt der Handler zwar auf `getOAuthRedirectURL(event)` zurück,
 *   schreibt das aber in eine *lokale* Variable; beim Token-Tausch schickt er
 *   `redirect_uri: config.redirectURL` — also `undefined`, und Apple antwortet
 *   `invalid_grant`.
 * - Der Scope ist eine **Einbahnstraße**: Apple kennt keine inkrementellen Scopes.
 *   Was bei der ersten Autorisierung eines Nutzers nicht angefordert wurde, bekommt
 *   dieser Nutzer nie wieder — Reparatur nur über „Verwendung beenden" in den
 *   Apple-ID-Einstellungen. Deshalb steht `name email` von Anfang an fest.
 *
 * Apple leitet nicht auf `localhost` um; durchspielen lässt sich das nur auf
 * `dev.training.pauldiepold.de`.
 */

export default defineEventHandler(async (event) => {
  const kv = envOf(event).SESSION_KV

  const istCallback =
    getRequestHeader(event, 'content-type') === 'application/x-www-form-urlencoded'

  if (!istCallback) {
    const handle = await putAuthState(kv, {
      redirectTo: sichererZielpfad(getQuery(event).redirect),
    })
    // `none` ist bei Apple Pflicht, nicht Geschmack: Der Callback ist ein cross-site
    // POST. Das erzwingt `secure` — kein Verlust, Apple leitet ohnehin nicht auf
    // `localhost` um.
    setzeAuthStateCookie(event, handle, 'none')

    return defineOAuthAppleEventHandler({
      config: { scope: ['name', 'email'] },
      onSuccess(event) {
        // Unerreichbar: Ohne form_post-Body bleibt der Handler im Redirect-Zweig.
        return providerFehler(event, 'apple', 'unerwarteter Callback')
      },
      onError(event, error) {
        return providerFehler(event, 'apple', error)
      },
    })(event)
  }

  const zustand = await takeAuthState(kv, nimmAuthStateCookie(event))
  if (!zustand) {
    // Unbekanntes, abgelaufenes oder bereits benutztes Handle.
    return providerFehler(event, 'apple', 'ungültiger state')
  }

  return defineOAuthAppleEventHandler({
    config: { scope: ['name', 'email'] },

    onSuccess(event, { user, payload }) {
      return anmeldenNachProviderLogin(
        event,
        {
          provider: 'apple',
          sub: String(payload?.sub ?? ''),
          // Genau einmal geliefert, defensiv geparst — nur Vorbelegung, nie Quelle.
          name: appleAnzeigename(user),
          // Anders als der Name steht die Adresse bei jedem Login im id_token.
          email: typeof payload?.email === 'string' ? payload.email : '',
        },
        zustand.redirectTo,
      )
    },

    onError(event, error) {
      return providerFehler(event, 'apple', error)
    },
  })(event)
})
