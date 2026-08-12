import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxt/ui', 'nitro-cloudflare-dev', 'nuxt-auth-utils'],

  // Nuxt UI v4 / Tailwind v4 Styles (für die interaktive Edit-Seite, Issue #12).
  css: ['~/assets/css/main.css'],

  // Icons in den Bundle kompilieren statt zur Laufzeit nachladen.
  //
  // Default wäre `provider: 'server'`: Der Client holt jedes Icon per Fetch von
  // /api/_nuxt_icon. Beim SSR läuft derselbe Pfad — und dort setzt @nuxt/icon
  // `$fetch.native` als Fetch-Implementierung. Die gibt es am request-gebundenen
  // $fetch von Nuxt 4.5 nicht mehr (undefined), also fällt Iconify auf das globale
  // fetch zurück und scheitert an der **relativen** URL `/api/_nuxt_icon/…`.
  // Ergebnis: `WARN [Icon] failed to load icon lucide:…` bei jedem Seitenaufbau,
  // Icons erscheinen erst nach der Hydration.
  //
  // `clientBundle.scan` sammelt die im Quellcode genutzten Icon-Namen beim Build
  // ein und legt sie als Modul bei — kein Fetch, kein Warten, und im Worker auch
  // kein Rundweg über die eigene Origin. Voraussetzung ist die lokal installierte
  // Collection @iconify-json/lucide; die kam bis @nuxt/ui v3 huckepack mit, seit
  // v4 ist sie eine eigene devDependency.
  icon: {
    // Icons, die erst zur Laufzeit aus Daten entstehen (dynamische Namen), findet
    // der Scan nicht; die gehen weiter über den Server-Endpunkt.
    clientBundle: { scan: true },
  },

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

    // Welche Umgebung der wrangler.jsonc `nuxt dev` bindet (nitro-cloudflare-dev →
    // getPlatformProxy). Ohne diesen Schalter wäre es die Top-Level-Konfiguration,
    // also dev. `CF_DEV_ENV=production pnpm dev` (Default hier) hängt den localhost
    // an die **Produktions**-D1 und -KVs — echte Athletendaten, echte Sessions,
    // Schreibzugriffe inklusive. Auf dev zurück: `CF_DEV_ENV= pnpm dev`.
    // Betrifft ausschließlich den Dev-Server; `wrangler deploy` liest das nicht.
    cloudflareDev: {
      environment: process.env.CF_DEV_ENV ?? 'production',
    },
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
        'chart.js',
        'chartjs-adapter-date-fns',
        'marked',
        'vue-chartjs',
      ]
    }
  }
})
