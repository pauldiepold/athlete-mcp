import type { H3Event } from 'h3'
import type {
  AuthorizationError,
  AuthRequest,
  ClientInfo,
  OAuthHelpers,
} from '@cloudflare/workers-oauth-provider'

/**
 * Die Brücke von Nitro zum Authorization Server (Issue #43).
 *
 * `/authorize` ist der eine OAuth-Endpunkt, den `@cloudflare/workers-oauth-provider`
 * **nicht** selbst beantwortet: Er braucht eine Login- und Consent-Fläche, und die
 * gehört dorthin, wo alle anderen Flächen liegen — nach Nuxt. Der Provider reicht
 * dafür seine Helfer als Binding `OAUTH_PROVIDER` durch, die Nitro wie jede andere
 * Cloudflare-Binding unter `event.context.cloudflare.env` ablegt (Spike #37,
 * Checkpoint 2).
 *
 * Beide Hälften der Fläche — die Anzeige der Anfrage und die Freigabe — brauchen
 * dieselbe Vorarbeit: Anfrage parsen, Client nachschlagen, Fehler unterscheiden.
 * Deshalb liegt sie hier und nicht doppelt in den beiden Endpunkten; auseinander
 * gelaufene Prüfungen wären genau die Sorte Fehler, die man erst im Betrieb sieht.
 */

/**
 * Erkennt einen `AuthorizationError` am Namen statt per `instanceof`.
 *
 * Ein **Wert**-Import aus `@cloudflare/workers-oauth-provider` zieht dessen statisches
 * `import { WorkerEntrypoint } from 'cloudflare:workers'` mit. Im Deployment ist das
 * richtig, im `nuxt dev` aber nicht: Dort läuft Nitro in Node, und der ESM-Loader kennt
 * das Schema `cloudflare:` nicht. Weil die Utils in einem Modulgraphen hängen, legt der
 * Import dann nicht bloß `/authorize` lahm, sondern jede Route des Dev-Servers.
 *
 * Der Typ genügt hier: Der Provider setzt `name` in seinem Konstruktor selbst.
 */
function istAutorisierungsFehler(error: unknown): error is AuthorizationError {
  return error instanceof Error && error.name === 'AuthorizationError'
}

/** Die Helfer des Providers für diesen Request. */
export function oauthHelpers(event: H3Event): OAuthHelpers {
  const provider = envOf(event).OAUTH_PROVIDER

  if (!provider) {
    // Der Provider injiziert die Binding, bevor er an Nitro weiterreicht. Fehlt sie,
    // läuft dieser Request an ihm vorbei — dann ist der Wrapper in `worker/index.ts`
    // nicht aktiv, und eine Freigabe wäre hier nicht bloß erfolglos, sondern sinnlos.
    throw createError({
      statusCode: 500,
      statusMessage: 'OAUTH_PROVIDER-Binding fehlt — läuft der Worker ohne Wrapper?',
    })
  }

  return provider
}

/**
 * Was aus einer Autorisierungs-Anfrage werden kann. Die drei Fälle sind bewusst
 * getrennt, weil sie **verschiedene Adressaten** haben:
 *
 * - `anfrage` — der Athlet entscheidet.
 * - `abbruch` — der *Client* erfährt es, an seiner registrierten `redirect_uri`. Nur
 *   möglich, wenn Client und URI bereits geprüft sind.
 * - `fehler` — niemand außer dem Athleten erfährt es, weil es keine vertrauenswürdige
 *   Adresse gibt, an die man umleiten dürfte (unbekannter Client, ungültige
 *   `redirect_uri`). Hier zu redirecten wäre eine offene Weiterleitung.
 */
export type AnfrageErgebnis =
  | { art: 'anfrage'; anfrage: AuthRequest; client: ClientInfo }
  | { art: 'abbruch'; redirectTo: string }
  | { art: 'fehler'; meldung: string }

/**
 * Liest die Autorisierungs-Anfrage aus der Query **dieses** Requests und schlägt den
 * Client nach.
 *
 * Die Query reist dafür von `/authorize` an die beiden API-Endpunkte weiter — der
 * Parser des Providers schaut ausschließlich auf die Query, nicht auf den Pfad. Der
 * Vorteil gegenüber einem Zwischenspeicher im KV: Es gibt keinen zweiten Zustand, der
 * ablaufen, verloren gehen oder von einer anderen Anfrage überschrieben werden könnte.
 */
export async function leseAutorisierungsAnfrage(
  event: H3Event,
): Promise<AnfrageErgebnis> {
  const helpers = oauthHelpers(event)

  let anfrage: AuthRequest
  try {
    anfrage = await helpers.parseAuthRequest(toWebRequest(event))
  } catch (error) {
    if (istAutorisierungsFehler(error)) {
      // Eine `redirectUri` gibt der Provider nur heraus, wenn Client und URI geprüft
      // sind — genau dann darf (und soll) der Client die Antwort bekommen.
      if (error.redirectUri) {
        return {
          art: 'abbruch',
          redirectTo: autorisierungsFehlerUrl(error.redirectUri, {
            code: error.code,
            description: error.description,
            state: error.state,
            issuer: error.issuer,
          }),
        }
      }
      return { art: 'fehler', meldung: error.description }
    }
    throw error
  }

  const client = await helpers.lookupClient(anfrage.clientId)
  if (!client) {
    // Kann nach erfolgreichem `parseAuthRequest` praktisch nicht passieren (der prüft
    // den Client mit) — aber „Client verschwunden" ist kein Grund, irgendwohin zu
    // redirecten.
    return { art: 'fehler', meldung: 'Dieser Client ist nicht registriert.' }
  }

  return { art: 'anfrage', anfrage, client }
}
