// Liefert das rohe Steuerungsplan-Markdown des per View-Secret identifizierten
// Nutzers als JSON (für die Edit-Seite, Issue #12). Bindings/Secret bleiben
// server-seitig (resolveSteuerung) — im Client landet nur das eigene Markdown des
// Nutzers, dessen Secret ohnehin in seiner URL steht. Unbekanntes Secret → 404.
export default defineEventHandler(async (event) => {
  const { userId, store } = await resolveSteuerung(event)

  const [markdown, wochen] = await Promise.all([
    store.getPlan(userId),
    store.listWochen(userId),
  ])
  return { markdown, wochen, user: userId }
})
