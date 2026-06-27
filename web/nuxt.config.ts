import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxt/ui', 'nitro-cloudflare-dev'],

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
  },
})
