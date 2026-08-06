import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'

/**
 * `.md`-Importe als Rohtext — dasselbe, was Nitros eingebauter `raw`-Plugin im Build
 * tut (ADR-0008: die Verfahrenstexte liegen als Markdown und werden hereingezogen).
 * Vite kennt nur `?raw`; damit Test und Build **denselben** Importpfad sehen, wird die
 * endungsbasierte Auflösung hier nachgebaut statt der Query im Quelltext.
 */
function markdownAlsRohtext(): Plugin {
  return {
    name: 'markdown-als-rohtext',
    enforce: 'pre',
    async transform(_code, id) {
      if (!id.endsWith('.md')) return
      const inhalt = await readFile(id, 'utf8')
      return { code: `export default ${JSON.stringify(inhalt)}`, map: null }
    },
  }
}

// Eigener Test-Runner fürs Web-Target (das Root-vitest deckt nur src/ + test/ ab).
// Bewusst minimal: hier werden die puren, Nuxt-unabhängigen Server-Module getestet
// (der Operator-Guard aus Issue #14, die MCP-Tool-Registrierung aus ADR-0007).
export default defineConfig({
  plugins: [markdownAlsRohtext()],

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
