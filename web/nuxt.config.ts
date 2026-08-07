import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxt/ui', 'nitro-cloudflare-dev', 'nuxt-auth-utils'],

  // Nuxt UI v4 / Tailwind v4 Styles (für die interaktive Edit-Seite, Issue #12).
  css: ['~/assets/css/main.css'],

  // Anmeldung und Rollen (ADR-0007). Die Werte kommen real per Env-Secret; hier stehen
  // nur die Defaults, damit Nitro die Schlüssel kennt. nuxt-auth-utils liest sie selbst
  // aus NUXT_SESSION_PASSWORD und NUXT_OAUTH_<PROVIDER>_<FELD>.
  //
  // Die beiden Hosts für die Nutzer-Links des Admin-Directorys (mcpBaseUrl/webBaseUrl)
  // sind mit ADR-0007 entfallen: MCP-Endpunkt und Browser-Fläche liegen auf **einer**
  // Origin, und die kommt aus dem Request statt aus der Konfiguration.
  runtimeConfig: {
    session: {
      // sealed-cookie-Session statt URL-Secret. Echter Wert per Env-Secret.
      password: '',
      // Ein Jahr. Ohne `maxAge` schreibt h3 ein reines Browser-Session-Cookie — die
      // Anmeldung wäre beim nächsten Browser-Neustart weg, auf dem Handy also
      // regelmäßig. Verlangt ist „einmal pro Gerät anmelden und angemeldet bleiben";
      // wer ein fremdes Gerät benutzt hat, meldet sich ab.
      maxAge: 60 * 60 * 24 * 365,
    },
    oauth: {
      // Google und Apple als Anmeldeverfahren; GitHub ist mit ADR-0005 entfallen.
      //
      // `redirectURL` ist bei Google optional: Leer gelassen leitet der Handler sie aus
      // dem Request ab — und rät dabei das Schema aus `x-forwarded-proto`. Hinter
      // Cloudflare stimmt das, aber die URI muss exakt zu der bei Google hinterlegten
      // passen; deshalb ist der Schlüssel hier deklariert und per
      // NUXT_OAUTH_GOOGLE_REDIRECT_URL festnagelbar.
      google: { clientId: '', clientSecret: '', redirectURL: '' },
      // Vier Secrets statt einem — und `redirectURL` **muss** gesetzt sein, sonst
      // schickt der Handler beim Token-Tausch `undefined` und Apple antwortet
      // `invalid_grant` (siehe server/routes/auth/apple.ts).
      apple: {
        clientId: '',
        teamId: '',
        keyId: '',
        privateKey: '',
        redirectURL: '',
      },
    },
    // Operator-Allowlist: Google-`sub`, kommagetrennt (NUXT_OPERATOR_SUBS). Leer heißt
    // **kein** Operator, nicht *alle* — siehe server/utils/isOperator.ts.
    operatorSubs: '',
  },

  // Das einzige Deployable (ADR-0007): Weboberfläche, MCP-Endpunkt und Cron in einem
  // Cloudflare-Worker.
  nitro: {
    preset: 'cloudflare-module',

    // Der Körperdaten-Cron als Nitro-Task statt als `scheduled`-Export eines eigenen
    // Workers. Der Name kommt aus dem **Dateipfad** (server/tasks/koerperdaten.ts),
    // nicht aus `meta.name` — ein Eintrag auf einen nicht existierenden Namen wäre
    // beim Build nur eine Warnung und der Cron liefe still ins Leere.
    experimental: { tasks: true },
    scheduledTasks: { '0 5 * * *': ['koerperdaten'] },
  },

  // Geteilte TS-Module direkt aus ../src importieren (Single Source of Truth fürs
  // Schema, keine Drift — siehe docs/adr/0004). Kein Duplikat, kein Package-Hop.
  alias: {
    '@shared': fileURLToPath(new URL('../src', import.meta.url)),
  },

  // Dev-Server darf Dateien außerhalb von web/ lesen (../src).
  vite: {
    server: { fs: { allow: ['..'] } },
    optimizeDeps: {
      include: [
        'marked',
      ]
    }
  }
})
