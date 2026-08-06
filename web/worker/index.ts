/**
 * Der Einstiegspunkt des Deployables — und die einzige Datei, die *vor* Nuxt läuft.
 *
 * Seit Issue #43 ist athlete-mcp sein eigener **OAuth-2.1-Authorization-Server**
 * (ADR-0007): Claude trägt eine für alle gleiche URL ein, wird in den Browser
 * geschickt, meldet sich mit seiner Identität an, gibt frei — und bekommt ein
 * Bearer-Token. Das Pfad-Secret, das diese Rolle vorher hatte, ist damit weg.
 *
 * `@cloudflare/workers-oauth-provider` bringt dafür Discovery (RFC 8414/9728),
 * Dynamic Client Registration (RFC 7591), den Token-Endpunkt samt PKCE und Refresh,
 * und den 401 mit `www-authenticate` auf `/mcp`. Was er **nicht** bringt, ist die
 * Login- und Consent-Fläche — die liegt in Nuxt, wo alle anderen Flächen auch liegen
 * (`app/pages/authorize.vue`).
 *
 * **Nitros Output wird nicht gepatcht, nur umschlossen.** `.output/server/index.mjs`
 * wird unverändert importiert und gleich zweimal eingesetzt: als `defaultHandler`
 * (Weboberfläche, `/authorize`, Static-Asset-Fallbacks) und als `apiHandler` für
 * `/mcp`. Dass beides derselbe Handler ist, ist der Punkt — der MCP-Endpunkt bleibt
 * eine gewöhnliche Nitro-Route mit Zugriff auf `server/utils/`, den `@shared`-Alias
 * und die Bindings; der Provider hängt vor ihr nur die Token-Prüfung ein und legt die
 * Identität als `ctx.props` daneben (siehe `server/routes/mcp.ts`). Ein eigener
 * MCP-Handler in dieser Datei müsste die halbe Domänen-Bibliothek noch einmal
 * verdrahten, ohne Nuxts Alias-Auflösung.
 *
 * Static Assets sieht der Provider nie: Der Asset-Router von Cloudflare liegt vor dem
 * Worker (Spike #37, Checkpoint 2).
 *
 * Bewusst außerhalb von `server/`: Nitro würde jede Datei dort als eigene Route oder
 * Util einsammeln, und diese hier ist das Gegenteil davon — sie umschließt Nitro.
 */

import { OAuthProvider } from '@cloudflare/workers-oauth-provider'

// Das generierte Nitro-Bundle. Es existiert erst nach `nuxt build` — deshalb ist der
// Build-Schritt beim Deploy nicht optional, und deshalb typecheckt diese Datei nur auf
// einem gebauten Baum.
import nitro from '../.output/server/index.mjs'

/**
 * Nitros Bundle, so weit getypt, wie diese Datei es benutzt. `fetch` ist dort
 * garantiert vorhanden — der Provider verlangt einen Handler, der ihn hat.
 */
type NitroBundle = ExportedHandler<Env> & Required<Pick<ExportedHandler<Env>, 'fetch'>>

const nitroHandler = nitro as NitroBundle

const provider = new OAuthProvider({
  // Eine MCP-Route, für alle Athleten dieselbe URL. Wer dahinter steckt, sagt das
  // Bearer-Token, nicht der Pfad.
  apiRoute: '/mcp',
  apiHandler: nitroHandler,
  defaultHandler: nitroHandler,

  // `/authorize` implementiert der Provider **nicht** selbst — er bewirbt den Pfad nur
  // in der Discovery und reicht ihn an den defaultHandler, also an Nuxt.
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',

  // Dynamic Client Registration bleibt offen: Claude registriert sich selbst, und ohne
  // Konto und ohne Zustimmung im Browser entsteht daraus kein Token. Der Registrierung
  // eine Hürde vorzubauen würde den Connector-Einrichtungsweg brechen, ohne etwas zu
  // schützen — die Prüfung sitzt an der Autorisierung.
  clientRegistrationEndpoint: '/oauth/register',

  // CIMD bleibt aus (bräuchte `global_fetch_strictly_public`); Claude kommt mit DCR
  // durch, im Spike #37 gegen claude.ai nachgewiesen.
  clientIdMetadataDocumentEnabled: false,

  scopesSupported: ['athlete'],

  // Access-Token bei der Vorgabe des Providers (eine Stunde). Der Refresh-Token
  // dagegen **ohne Ablauf**: Eine Connector-Verbindung soll halten, bis sie jemand
  // löst. Ein Ablauf nach 30 Tagen hieße, dass ein Athlet seinen Connector regelmäßig
  // neu einrichtet, ohne dass dabei irgendetwas geprüft würde — der Widerruf läuft
  // über das Löschen des Grants, nicht über Verfall.
  //
  // Das explizite `undefined` ist die dafür vorgesehene Schreibweise („Set to
  // `undefined` explicitly for refresh tokens that never expire"), aber sie trägt nur,
  // weil der Provider seine Defaults per Spread überschreibt. Ginge er je auf `??`
  // über, fiele hier lautlos der 30-Tage-Default zurück — ohne Fehler, nur mit
  // Connectoren, die nach einem Monat neu eingerichtet werden wollen. Beim
  // Aktualisieren des Pakets ist das die Stelle, die man nachliest.
  refreshTokenTTL: undefined,
})

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return provider.fetch(request, env, ctx)
  },

  /**
   * Der Cron geht am Provider vorbei direkt an Nitro — dort liegt der
   * Körperdaten-Task. Dass er den Wrapper überlebt, war Checkpoint 2 des Spikes #37
   * und ist der Grund, warum diese Datei den `scheduled`-Export überhaupt anfassen
   * muss: Ohne ihn hätte das Deployable keinen mehr.
   *
   * Daneben das Aufräumen des Providers: `purgeExpiredData` räumt verwaiste Grants und
   * Tokens aus dem KV, für die KVs eigene TTL nicht zuständig ist (ein gelöschter
   * Client lässt seine Grants stehen).
   */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    await nitroHandler.scheduled?.(controller, env, ctx)
    ctx.waitUntil(provider.purgeExpiredData(env))
  },
} satisfies ExportedHandler<Env>
