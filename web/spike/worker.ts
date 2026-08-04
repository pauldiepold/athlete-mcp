/**
 * SPIKE #37 — Checkpoint 2: eigene `main`-Datei, die Nitros generiertes Bundle
 * als `defaultHandler` an den OAuthProvider durchreicht.
 *
 * Kein Patchen von Nitro-Output: `.output/server/index.mjs` wird unverändert
 * importiert und nur umschlossen. Sobald hier gepatcht werden müsste, wäre das
 * laut Issue das Abbruchkriterium.
 */

import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
// @ts-expect-error — generiertes Nitro-Bundle, existiert erst nach `nuxt build`.
import nitro from '../.output/server/index.mjs'
import { handleMcp, type SpikeProps } from './mcp'

/** Vom OAuthProvider aufgerufen, nachdem das Bearer-Token validiert wurde. */
const apiHandler = {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext & { props?: SpikeProps }) {
    return handleMcp(request, ctx.props)
  },
}

const provider = new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: apiHandler as any,
  // Alles andere — Nuxt-Seiten, Static-Asset-Fallbacks, /authorize — geht an Nitro.
  defaultHandler: nitro as any,

  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',

  scopesSupported: ['athlete'],
})

/** Nur zum Nachweis im Spike: hält fest, ob und wie der Cron durchkam. */
const cronLog: string[] = []

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === '/spike/cron-log') {
      return Response.json({ cronLog })
    }
    return provider.fetch(request, env, ctx)
  },
  // Der Cron geht am OAuthProvider vorbei direkt an Nitro (Checkpoint 2, Frage 3).
  async scheduled(event: ScheduledController, env: any, ctx: ExecutionContext) {
    cronLog.push(`wrapper.scheduled cron=${event.cron} ${new Date().toISOString()}`)
    const nitroScheduled = (nitro as any).scheduled
    if (typeof nitroScheduled !== 'function') {
      cronLog.push('nitro hat KEINEN scheduled-Export')
      return
    }
    // Nitro schiebt runCronTasks in ctx.waitUntil — hier einsammeln, damit der
    // Spike sieht, ob der Task wirklich lief und nicht nur der Handler.
    const pending: Promise<unknown>[] = []
    const spyCtx = {
      ...ctx,
      waitUntil: (p: Promise<unknown>) => {
        pending.push(p)
        ctx.waitUntil(p)
      },
      passThroughOnException: () => {},
    }
    await nitroScheduled(event, env, spyCtx)
    const results = await Promise.allSettled(pending)
    cronLog.push(`nitro.scheduled → ${JSON.stringify(results)}`)
  },
}
