// Typen der Operator-Session (Issue #14). nuxt-auth-utils liest hieraus die Form von
// `useUserSession().user` und `setUserSession`. Nur das Nötige fürs Anzeigen — die
// Session ist die Betreiber-Identität, keine Mandantendaten.
declare module '#auth-utils' {
  interface User {
    login: string
    name: string
    avatarUrl: string
  }
}

export {}
