// Speichert das vom Browser getippte Steuerungsplan-Markdown (Issue #12).
// Authentifiziert über dasselbe View-Secret wie die Lese-/Edit-Ansicht (read+edit,
// ADR-0004, via resolveSteuerung) — ohne gültiges Secret kein Save (404). Persistiert
// byte-genau via SteuerungStore.setPlan: keine Konvertierung, damit der Agent über MCP
// unverändert dasselbe liest. Last-Write-Wins, bewusst kein Konflikt-Handling (ADR-0004).
export default defineEventHandler(async (event) => {
  const { userId, store } = await resolveSteuerung(event)

  const body = await readBody<{ markdown?: unknown }>(event)
  if (typeof body?.markdown !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'markdown (string) erforderlich' })
  }

  await store.setPlan(userId, body.markdown)
  return { ok: true }
})
