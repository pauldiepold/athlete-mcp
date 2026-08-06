// Form der Session (ADR-0007). Seit der OAuth-Umstellung ist die Session die
// Anmeldung **des Athleten** — vorher war sie allein die Operator-Identität aus
// ADR-0005, und die Athleten hingen an einem Secret in der URL.
//
// Die Aufteilung ist bewusst: `User` geht an den Browser, `SecureSessionData` bleibt
// server-seitig. Die **Identität** (`provider`/`sub`) ist der Anker der Anmeldung und
// gehört deshalb nach `secure`; im `user` steht nur Anzeige-Material plus das Gate für
// die Admin-Navigation, das der Server ohnehin selbst nachrechnet.
//
// Liegt in `shared/`, nicht im Wurzelverzeichnis: Der TS-Kontext des Servers zieht
// `../shared/**/*.d.ts` mit ein, `../*.d.ts` aber nur der des Clients. Am alten Ort
// kannte der Server die Felder schlicht nicht.
import type { Provider } from '@shared/identitaet'

declare module '#auth-utils' {
  interface User {
    /** Das Konto — Primärschlüssel in D1 und Präfix im KV. */
    userId: string
    /** Anzeigename aus dem Profil; darf leer sein. */
    name: string
    /** Attribut, nie Identifier; darf leer sein. */
    email: string
    /** Nur fürs UI: blendet den Admin-Eintrag ein. Der Guard rechnet selbst nach. */
    operator: boolean
  }

  // Die Felder sind einzeln optional, weil die Session zwei Zustände kennt: eine
  // fertige Anmeldung (`provider`/`sub`, dazu ein `user`) und eine Identität, die noch
  // auf ihren Invite-Code wartet (`pending`, ohne `user`). Nie beides zugleich.
  interface SecureSessionData {
    provider?: Provider
    sub?: string
    /**
     * Eine Identität ohne Konto, zwischen Provider-Login und Einlösen des
     * Invite-Codes. Sie ist **keine** Anmeldung: Solange sie hier steht, gibt es kein
     * `user` und damit keinen Zugriff auf Daten.
     */
    pending?: {
      provider: Provider
      sub: string
      /** Vorbelegung des Anzeigenamens aus dem Provider; darf leer sein. */
      name: string
      email: string
      /** Wohin es nach dem Einlösen geht. */
      redirectTo: string
    }
  }
}

export {}
