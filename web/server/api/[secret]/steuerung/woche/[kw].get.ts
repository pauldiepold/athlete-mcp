import { TenantResolver } from '@shared/tenantResolver'
import { SteuerungStore, isValidKw } from '@shared/steuerung/steuerungStore'

// Liefert das rohe Markdown einer Woche des per View-Secret identifizierten Nutzers
// plus die Liste vorhandener kw (für Prev/Next-Navigation), als JSON für die
// Wochen-Edit-Seite (Issue #13). Bindings/Secret bleiben server-seitig. Unbekanntes
// Secret → 404; ungültiges kw-Format → 404 (wie die server-gerenderte Read-Ansicht).
// Eine noch nicht existierende kw liefert markdown: "" (anlegbar durch Speichern).
export default defineEventHandler(async (event) => {
  const { ATHLETE_DB, SESSION_KV } = event.context.cloudflare.env as unknown as {
    ATHLETE_DB: D1Database
    SESSION_KV: KVNamespace
  }
  const secret = getRouterParam(event, 'secret')!
  const kw = getRouterParam(event, 'kw')!

  if (!isValidKw(kw)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const userId = await new TenantResolver(SESSION_KV).resolveViewSecret(secret)
  if (!userId) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const store = new SteuerungStore(ATHLETE_DB)
  const [markdown, wochen] = await Promise.all([
    store.getWoche(userId, kw),
    store.listWochen(userId),
  ])
  return { markdown, wochen, user: userId }
})
