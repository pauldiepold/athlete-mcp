/**
 * Anmeldung per Apple (ADR-0007). Kein `.get`-Suffix im Dateinamen: Apple antwortet
 * ausschließlich mit `response_mode=form_post`, der Callback ist also ein **POST** auf
 * denselben Pfad, über den der Login startet.
 *
 * Der Handler wird **pro Request** instanziiert. `defineOAuthAppleEventHandler`
 * überschreibt seine eigene Closure-Variable `config` beim ersten Aufruf
 * (`config = defu(config, …)`); ein einmal definierter Handler würde den `state` des
 * ersten Requests für alle folgenden einfrieren. Der Zustand geht als
 * `authorizationParams` mit, weil der Apple-Handler von sich aus **kein** `state`
 * sendet — und folglich auch keines prüft. Genau deshalb ist der KV-Zustand hier
 * nicht nur Transport, sondern der CSRF-Schutz (siehe `utils/authState.ts`); er wird
 * **vor** dem Token-Tausch eingelöst, damit ein Callback mit erfundenem `state` nicht
 * erst einen Request an Apple kostet.
 *
 * Die Unterscheidung Hinweg/Callback läuft über denselben strikten Vergleich des
 * `content-type`, den die Bibliothek intern benutzt. Ein Präfix-Vergleich wäre für
 * sich robuster, würde hier aber gerade den Schaden anrichten: Wichen die beiden
 * Urteile auseinander, prüfte diese Route einen `state`, den die Bibliothek als
 * Hinweg behandelt — und der CSRF-Schutz liefe ins Leere. Gleich streng ist richtiger
 * als für sich robust.
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
    const state = await putAuthState(kv, {
      redirectTo: sichererZielpfad(getQuery(event).redirect),
    })

    return defineOAuthAppleEventHandler({
      config: { scope: ['name', 'email'], authorizationParams: { state } },
      onSuccess(event) {
        // Unerreichbar: Ohne form_post-Body bleibt der Handler im Redirect-Zweig.
        return providerFehler(event, 'apple', 'unerwarteter Callback')
      },
      onError(event, error) {
        return providerFehler(event, 'apple', error)
      },
    })(event)
  }

  // `readBody` cacht am Event; das zweite `readBody` im Handler bekommt denselben
  // Body samt `code` und `user`.
  const body = (await readBody(event)) as { state?: string } | undefined

  const zustand = await takeAuthState(kv, body?.state)
  if (!zustand) {
    // Unbekannter, abgelaufener oder bereits benutzter `state` — und damit auch der
    // Fall, für den es bei Apple sonst gar keine Prüfung gäbe.
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
