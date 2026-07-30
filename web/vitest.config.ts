import { defineConfig } from 'vitest/config'

// Eigener Test-Runner fürs Web-Target (das Root-vitest deckt nur src/ + test/ ab).
// Bewusst minimal: hier werden die puren, Nuxt-unabhängigen Server-Utils getestet
// (z. B. der Operator-Guard, Issue #14).
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
  },
})
