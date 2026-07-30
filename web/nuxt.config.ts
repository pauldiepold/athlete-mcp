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
    // Basis-URL des MCP-Workers für die im Admin-Directory gebauten MCP-/View-Links
    // (Issue #15) — dieselbe Quelle wie scripts/onboard.ts. Override per NUXT_MCP_BASE_URL.
    mcpBaseUrl: 'https://athlete-mcp.pauldiepold.workers.dev',
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
