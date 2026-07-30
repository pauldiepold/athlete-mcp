import { isValidKw } from '@shared/steuerung/steuerungStore'

// Speichert das vom Browser getippte Wochen-Markdown (Issue #13). Authentifiziert
// über dasselbe View-Secret wie die Lese-/Edit-Ansicht (read+edit, ADR-0004, via
// resolveSteuerung) — ohne gültiges Secret kein Save (404). Ungültiges kw-Format → 400.
// Persistiert byte-genau via SteuerungStore.setWoche (keine Konvertierung, damit der
// Agent über MCP unverändert dasselbe liest); eine neue kw wird dabei angelegt.
// Last-Write-Wins (ADR-0004).
export default defineEventHandler(async (event) => {
  const kw = getRouterParam(event, 'kw')!
  if (!isValidKw(kw)) {
    throw createError({ statusCode: 400, statusMessage: 'kw im ISO-Format YYYY-Www erforderlich' })
  }

  const { userId, store } = await resolveSteuerung(event)

  const body = await readBody<{ markdown?: unknown }>(event)
  if (typeof body?.markdown !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'markdown (string) erforderlich' })
  }

  await store.setWoche(userId, kw, body.markdown)
  return { ok: true }
})
