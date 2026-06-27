import { TenantResolver } from '@shared/tenantResolver'
import { SteuerungStore } from '@shared/steuerung/steuerungStore'

// Daten für die Steuerungs-Übersicht (Issue #13): Steuerungsplan-Markdown + Wochen-Keys
// + Athlet-Key (userId) für die Kopfzeile. Bindings/Secret bleiben server-seitig.
// Über das View-Secret authentifiziert (read+edit, ADR-0004); unbekanntes Secret → 404.
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

  const store = new SteuerungStore(ATHLETE_DB)
  const [plan, wochen] = await Promise.all([
    store.getPlan(userId),
    store.listWochen(userId),
  ])
  return { plan, wochen, user: userId }
})
