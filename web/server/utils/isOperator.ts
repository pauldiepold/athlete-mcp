// Operator-Allowlist (ADR-0005): die /admin-Fläche aggregiert später alle MCP-Schreib-
// Secrets, ist also das stärkste Gate im System. Einziger Betreiber ist aktuell
// `pauldiepold` — bewusst hartkodiert statt Env, weil es genau eine Identität gibt und
// jede Indirektion hier nur Angriffsfläche wäre. Liegt im Frontend, nicht in src/: der
// Operator-Begriff gehört zur Nuxt-App, der MCP-Worker bleibt unberührt (ADR-0004/0005).
export const OPERATOR_GITHUB_LOGINS = ['pauldiepold']

/**
 * Reiner Guard: ist `login` ein erlaubter Betreiber? Case-insensitiv (GitHub-Logins
 * sind es), trimmt und ignoriert Leeres. Nur diese Identität darf eine Session bekommen
 * (Prüfung am OAuth-Callback) — jede andere wird abgewiesen.
 */
export function isOperator(
  login: string | null | undefined,
  allowlist: readonly string[] = OPERATOR_GITHUB_LOGINS,
): boolean {
  const candidate = login?.trim().toLowerCase()
  if (!candidate) {
    return false
  }
  return allowlist.some((entry) => entry.trim().toLowerCase() === candidate)
}
