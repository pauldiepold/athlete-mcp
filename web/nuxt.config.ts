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
  runtimeConfig: {
    // Die beiden Hosts für die im Admin-Directory gebauten Nutzer-Links (Issue #15).
    // Getrennt, weil MCP-Endpunkt und Browser-Steuerung seit ADR-0004 auf zwei
    // Workern liegen — dieselben Defaults wie scripts/onboard.ts. Override per
    // NUXT_MCP_BASE_URL bzw. NUXT_WEB_BASE_URL.
    mcpBaseUrl: 'https://athlete-mcp.pauldiepold.workers.dev',
    webBaseUrl: 'https://athlete-web.pauldiepold.workers.dev',
    session: {
      // sealed-cookie-Session statt URL-Secret (ADR-0005). Echter Wert per Env-Secret.
      password: '',
    },
    oauth: {
      github: { clientId: '', clientSecret: '' },
    },
  },

  // Deploy als eigenständiger Cloudflare-Worker (zweites Target neben dem MCP-Worker).
  nitro: {
    preset: 'cloudflare-module',
    // SPIKE #37: Cron als Nitro-Task, um zu prüfen, ob `scheduled` den Wrapper überlebt.
    experimental: { tasks: true },
    // Der Task-Name kommt aus dem Dateipfad (server/tasks/spike-cron.ts), nicht aus meta.name.
    scheduledTasks: { '0 5 * * *': ['spike-cron'] },
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
