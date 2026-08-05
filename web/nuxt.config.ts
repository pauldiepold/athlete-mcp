import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxt/ui', 'nitro-cloudflare-dev', 'nuxt-auth-utils'],

  // Nuxt UI v4 / Tailwind v4 Styles (für die interaktive Edit-Seite, Issue #12).
  css: ['~/assets/css/main.css'],

  // Operator-Auth der /admin-Fläche (Issue #14, ADR-0005). Session-Password und die
  // GitHub-OAuth-Credentials liest nuxt-auth-utils selbst aus NUXT_SESSION_PASSWORD
  // bzw. NUXT_OAUTH_GITHUB_CLIENT_ID/SECRET — hier nur Defaults, real per Env-Secret.
  //
  // Die beiden Hosts für die Nutzer-Links des Admin-Directorys (mcpBaseUrl/webBaseUrl)
  // sind mit ADR-0007 entfallen: MCP-Endpunkt und Browser-Fläche liegen auf **einer**
  // Origin, und die kommt aus dem Request statt aus der Konfiguration.
  runtimeConfig: {
    session: {
      // sealed-cookie-Session statt URL-Secret (ADR-0005). Echter Wert per Env-Secret.
      password: '',
    },
    oauth: {
      github: { clientId: '', clientSecret: '' },
    },
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
