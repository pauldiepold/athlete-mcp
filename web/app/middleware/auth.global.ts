/**
 * Der Session-Guard der Athleten-Flächen (ADR-0007). Bis dahin trug das Secret in der
 * URL die Anmeldung mit sich; jetzt braucht es die Frage „ist hier jemand angemeldet?"
 * einmal für alle Seiten.
 *
 * Bewusst nur eine **Navigations-Regel**, kein Schutz: Der eigentliche Schutz sitzt
 * server-seitig in `resolveAthlet` und im Operator-Guard — jeder Endpunkt prüft selbst.
 * Was hier passiert, ist, dass niemand auf einer Seite landet, die nur leere Kästen und
 * einen 401 zeigen könnte.
 *
 * Offen bleiben: die Startseite (sie *ist* abgemeldet die Anmeldung) und die
 * Invite-Fläche (dort wartet eine Identität, die noch kein Konto hat — angemeldet im
 * Sinne dieser Regel ist sie gerade nicht).
 */
const OFFEN = ['/', '/invite']

export default defineNuxtRouteMiddleware((to) => {
  if (OFFEN.includes(to.path)) {
    return
  }

  const { loggedIn } = useUserSession()
  if (loggedIn.value) {
    return
  }

  // Das Ziel reist als `redirect` mit, damit ein geteilter Link auf eine Wochenseite
  // nach der Anmeldung dort ankommt und nicht auf dem Dashboard.
  return navigateTo({ path: '/', query: { redirect: to.fullPath } })
})
