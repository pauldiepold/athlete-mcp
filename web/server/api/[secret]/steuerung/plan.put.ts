import { TenantResolver } from '@shared/tenantResolver'
import { SteuerungStore } from '@shared/steuerung/steuerungStore'

// Speichert das vom Browser getippte Steuerungsplan-Markdown (Issue #12).
// Authentifiziert über dasselbe View-Secret wie die Lese-/Edit-Ansicht (read+edit,
// ADR-0004) — ohne gültiges Secret kein Save (404). Persistiert byte-genau via
// SteuerungStore.setPlan: keine Konvertierung, damit der Agent über MCP unverändert
// dasselbe liest. Last-Write-Wins, bewusst kein Konflikt-Handling (ADR-0004).
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

  const body = await readBody<{ markdown?: unknown }>(event)
  if (typeof body?.markdown !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'markdown (string) erforderlich' })
  }

  await new SteuerungStore(ATHLETE_DB).setPlan(userId, body.markdown)
  return { ok: true }
})
