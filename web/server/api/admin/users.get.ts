import { listOnboardedUsers } from '@shared/cli/operatorDirectory'

// Liefert das Operator-Directory (Issue #15): alle onboardeten Nutzer samt
// aufgelöster MCP-Schreib- und read-only View-URL. Eigener Operator-Guard, weil
// middleware/admin.ts nur Seiten-Pfade (`/`, `/admin*`) schützt, nicht `/api/admin/*`:
// eine Session existiert ausschließlich für die allowlistete Betreiber-Identität
// (OAuth-Callback), „Session vorhanden" = „Operator". Rein lesend über das
// SESSION_KV-Binding.
//
// Beide URLs entstehen aus der Origin dieses Requests: seit ADR-0007 liegen
// MCP-Endpunkt und Browser-Fläche im selben Deployable. Vorher standen dafür zwei
// konfigurierte Hosts in der runtimeConfig — mit dem Nebeneffekt, dass die lokal
// geöffnete Admin-Fläche Links in die Produktion ausgab.
export default defineEventHandler(async (event) => {
  const { user } = await getUserSession(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const env = event.context.cloudflare.env as unknown as Env
  return listOnboardedUsers(env.SESSION_KV, requestOrigin(event))
})
