// GitHub-OAuth-Endpunkt der Operator-Auth (Issue #14, ADR-0005). Erster Aufruf ohne
// `code` startet den OAuth-Flow (Redirect zu GitHub); GitHub ruft denselben Pfad mit
// `code` zurück → onSuccess. Die Identität wird hier gegen die Allowlist geprüft: nur
// der Betreiber bekommt eine sealed-cookie-Session, jede andere Identität wird abgewiesen
// (kein Session-Set → kein /admin-Zugang). Stärkstes Gate im System (ADR-0005).
export default defineOAuthGitHubEventHandler({
  async onSuccess(event, { user }) {
    if (!isOperator(user.login)) {
      await clearUserSession(event)
      throw createError({ statusCode: 403, statusMessage: 'Kein Operator-Zugang' })
    }

    await setUserSession(event, {
      user: {
        login: user.login,
        name: user.name ?? user.login,
        avatarUrl: user.avatar_url,
      },
    })

    return sendRedirect(event, '/admin')
  },

  onError(event, error) {
    console.error('GitHub-OAuth fehlgeschlagen:', error)
    return sendRedirect(event, '/admin')
  },
})
