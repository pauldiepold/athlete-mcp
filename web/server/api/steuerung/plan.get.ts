// Liefert das rohe Steuerungsplan-Markdown des angemeldeten Athleten als JSON (für
// die Edit-Seite, Issue #12). Die Bindings bleiben server-seitig (resolveSteuerung) —
// im Client landet nur das eigene Markdown des Athleten. Ohne Session → 401.
export default defineEventHandler(async (event) => {
  const { userId, store } = await resolveSteuerung(event)

  const [markdown, wochen] = await Promise.all([
    store.getPlan(userId),
    store.listWochen(userId),
  ])
  return { markdown, wochen, user: userId }
})
