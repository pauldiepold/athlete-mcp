import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

/**
 * Die eine Binding, die **nicht** in `wrangler.jsonc` steht (Issue #43).
 *
 * `@cloudflare/workers-oauth-provider` hängt seine Helfer beim Weiterreichen an den
 * Handler ins `env` — dieselbe Stelle, an der sonst KV und D1 landen, nur zur Laufzeit
 * injiziert statt konfiguriert. Ohne diese Deklaration stünde an jeder Lesestelle ein
 * Cast, der genau das verschweigt: dass es die Binding gibt, sie aber nirgends
 * eingetragen ist.
 *
 * **Optional, und das ist die Aussage:** Im `nuxt dev`-Server läuft der Wrapper aus
 * `worker/index.ts` nicht mit, dort fehlt sie. Wer sie liest, muss diesen Fall
 * behandeln (siehe `server/utils/oauth.ts`).
 *
 * Getrennt von `worker-configuration.d.ts`, weil `wrangler types` diese Datei bei
 * jedem Lauf überschreibt.
 */
declare global {
  interface Env {
    OAUTH_PROVIDER?: OAuthHelpers
  }
}

export {}
