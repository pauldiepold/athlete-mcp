import { TenantResolver } from '@shared/tenantResolver'
import { SteuerungStore } from '@shared/steuerung/steuerungStore'

// Liefert das rohe Steuerungsplan-Markdown des per View-Secret identifizierten
// Nutzers als JSON (für die Edit-Seite, Issue #12). Bindings/Secret bleiben
// server-seitig — im Client landet nur das eigene Markdown des Nutzers, dessen
// Secret ohnehin in seiner URL steht. Unbekanntes Secret → 404.
export default defineEventHandler(async (event) => {
  const { ATHLETE_DB, SESSION_KV } = event.context.cloudflare.env as unknown as {
    ATHLETE_DB: D1Database
    SESSION_KV: KVNamespace
  }
  const secret = getRouterParam(event, 'secret')!

  const userId = await new TenantResolver(SESSION_KV).resolveViewSecret(secret)
  if (!userId) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const markdown = await new SteuerungStore(ATHLETE_DB).getPlan(userId)
  return { markdown }
})
