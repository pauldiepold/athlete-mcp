import { handleSteuerungView } from '@shared/steuerung/steuerungView'

// Tracer-Surface (Issue #11): rein server-seitige Lese-Ansicht des Steuerungsplans.
// Wiederverwendung der bestehenden Worker-Logik (View-Secret-Auflösung, 404,
// Markdown→HTML) — kein Client-JS, also landet weder das Secret noch ein Binding
// im Browser-Bundle. Die Wochen-Ansicht (/{secret}/steuerung/{kw}) folgt separat.
export default defineEventHandler(async (event) => {
  // nitro-cloudflare-dev typisiert cloudflare.env generisch (PlatformProxy["env"]);
  // auf die konkrete Binding-Form casten (Namen/ids stammen aus wrangler.jsonc).
  const { ATHLETE_DB, SESSION_KV } = event.context.cloudflare.env as unknown as {
    ATHLETE_DB: D1Database
    SESSION_KV: KVNamespace
  }
  const { pathname } = getRequestURL(event)

  // canEdit=true: nur das Nuxt-Frontend hat die Edit-Seite (Issue #12).
  const res = await handleSteuerungView(pathname, SESSION_KV, ATHLETE_DB, true)
  if (!res) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return res
})
