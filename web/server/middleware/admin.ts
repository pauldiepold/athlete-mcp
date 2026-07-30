// Guard für die Operator-Fläche (Issue #14, ADR-0005): jeder /admin-Request ohne
// gültige Session wird in den GitHub-OAuth-Login geschickt. Die Session wird
// ausschließlich im OAuth-Callback und nur für die allowlistete Betreiber-Identität
// gesetzt (siehe routes/auth/github.get.ts) — „Session vorhanden" ist hier also
// gleichbedeutend mit „Operator". So bleibt der eigentliche isOperator-Check an einer
// Stelle und das stärkste Gate des Systems hängt nicht an einem URL-Secret.
export default defineEventHandler(async (event) => {
  // Geschützt: die Operator-Startseite (/) und die /admin-Fläche. Die Mandanten-
  // Ansichten (/{secret}/…) und der OAuth-Endpunkt (/auth/github) bleiben offen.
  const protectedPath = event.path === '/' || event.path.startsWith('/admin')
  if (!protectedPath) {
    return
  }

  const { user } = await getUserSession(event)
  if (!user) {
    return sendRedirect(event, '/auth/github')
  }
})
