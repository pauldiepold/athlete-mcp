import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Eigener Test-Runner fürs Web-Target (das Root-vitest deckt nur src/ + test/ ab).
// Bewusst minimal: hier werden die puren, Nuxt-unabhängigen Server-Module getestet
// (der Operator-Guard aus Issue #14, die MCP-Tool-Registrierung aus ADR-0007).
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
  },

  // Derselbe @shared-Alias wie in nuxt.config.ts: die Domänen-Bibliothek unter ../src
  // wird direkt importiert, nicht dupliziert (ADR-0004).
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
})
