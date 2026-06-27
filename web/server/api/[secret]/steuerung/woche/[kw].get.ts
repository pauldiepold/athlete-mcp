import { isValidKw } from '@shared/steuerung/steuerungStore'

// Liefert das rohe Markdown einer Woche des per View-Secret identifizierten Nutzers
// plus die Liste vorhandener kw (für Prev/Next-Navigation), als JSON für die
// Wochen-Edit-Seite (Issue #13). Bindings/Secret bleiben server-seitig
// (resolveSteuerung). Unbekanntes Secret → 404; ungültiges kw-Format → 400 (Client-
// Fehler, identisch zur PUT-Route auf derselben URL). Eine noch nicht existierende kw
// liefert markdown: "" (anlegbar durch Speichern).
export default defineEventHandler(async (event) => {
  const kw = getRouterParam(event, 'kw')!
  if (!isValidKw(kw)) {
    throw createError({ statusCode: 400, statusMessage: 'kw im ISO-Format YYYY-Www erforderlich' })
  }

  const { userId, store } = await resolveSteuerung(event)

  const [markdown, wochen] = await Promise.all([
    store.getWoche(userId, kw),
    store.listWochen(userId),
  ])
  return { markdown, wochen, user: userId }
})
