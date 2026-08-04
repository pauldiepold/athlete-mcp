/**
 * SPIKE #37 — Platzhalter-Login/Consent als *Nitro*-Route.
 *
 * Der Punkt dieser Datei ist nicht die Identitätslogik (die kommt später aus dem
 * Google-Login), sondern die Frage: Kommt die vom OAuthProvider injizierte
 * Binding `env.OAUTH_PROVIDER` überhaupt bis in eine Nitro-Route durch? Nitro
 * reicht das Worker-`env` über `event.context.cloudflare.env` weiter — genau das
 * wird hier benutzt.
 *
 * GET  → Consent-Seite, POST → completeAuthorization + Redirect.
 */
import type { OAuthHelpers, AuthRequest } from '@cloudflare/workers-oauth-provider'

function oauthHelpers(event: any): OAuthHelpers {
  const env = event.context?.cloudflare?.env
  if (!env?.OAUTH_PROVIDER) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OAUTH_PROVIDER-Binding fehlt im Nitro-Kontext',
    })
  }
  return env.OAUTH_PROVIDER as OAuthHelpers
}

export default defineEventHandler(async (event) => {
  const helpers = oauthHelpers(event)
  const request = toWebRequest(event)

  let oauthRequest: AuthRequest
  try {
    oauthRequest = await helpers.parseAuthRequest(request)
  } catch (error: any) {
    setResponseStatus(event, 400)
    return `parseAuthRequest fehlgeschlagen: ${error?.description ?? error?.message ?? String(error)}`
  }

  const client = await helpers.lookupClient(oauthRequest.clientId)
  if (!client) {
    setResponseStatus(event, 400)
    return 'Unbekannter OAuth-Client'
  }

  if (event.method === 'GET') {
    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    const params = new URL(request.url).search
    return `<!doctype html><html lang="de"><meta charset="utf-8">
<title>Zugriff freigeben — Spike</title>
<body style="font-family:system-ui;max-width:34rem;margin:4rem auto;line-height:1.5">
<h1>Zugriff freigeben</h1>
<p><strong>${client.clientName ?? oauthRequest.clientId}</strong> möchte auf dein
athlete-mcp-Konto zugreifen.</p>
<p>Scopes: <code>${oauthRequest.scope.join(' ') || '(keine)'}</code><br>
Resource: <code>${oauthRequest.resource ?? '(keine)'}</code></p>
<p style="color:#666">Spike-Platzhalter statt Google-Login — es wird fest
<code>userId=paul</code> freigegeben.</p>
<form method="post" action="/authorize${params}">
  <button style="padding:.6rem 1.2rem;font-size:1rem">Freigeben</button>
</form>
</body></html>`
  }

  const { redirectTo } = await helpers.completeAuthorization({
    request: oauthRequest,
    userId: 'paul',
    metadata: { clientName: client.clientName },
    scope: oauthRequest.scope,
    props: { userId: 'paul', displayName: 'Paul (Spike-Platzhalter)' },
  })

  return sendRedirect(event, redirectTo, 302)
})
