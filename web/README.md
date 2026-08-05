# web

**Das** Deployable des Projekts (ADR-0007): Nuxt-Oberfläche, MCP-Endpunkt und
Körperdaten-Cron in einem Cloudflare-Worker. Vorher lag der MCP-Teil in einem eigenen
Worker daneben.

- **MCP-Endpunkt** (`/{pathsecret}/mcp`) — Nitro-Route, stateless Streamable HTTP,
  kein Durable Object (`server/routes/[secret]/mcp.ts`, Tools in
  `server/utils/mcpServer.ts`).
- **Körperdaten-Cron** — Nitro-Task (`server/tasks/koerperdaten.ts`); die Fachlichkeit
  liegt in `@shared/garmin/koerperdatenCron`.

Dazu zwei Athleten-Flächen unter demselben per-User-Link, umschaltbar über die
Kopfzeile:

- **Dashboard** (`/{view-secret}`) — die Startseite: Verläufe der **Körperdaten** aus
  dem Archiv, rein lesend.
- **Steuerung** (`/{view-secret}/steuerung`) — Steuerungsplan + Wochen, lesen und
  editieren; Markdown bleibt das kanonische Speicherformat, byte-genau das, was der
  Agent über MCP liest/schreibt.

Siehe `../docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md`
und `../docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md`.

## Architektur (Kurz)

- **Geteilte Module statt Duplikat:** `SteuerungStore` und `TenantResolver` werden via
  `@shared`-Alias direkt aus `../src` importiert — Single Source of Truth fürs Schema,
  keine Drift (`nuxt.config.ts`).
- **Auth server-seitig, an einer Stelle:** Das per-User **View-Secret** aus der URL
  wird im Nitro-Server aufgelöst (`server/utils/athlet.ts`) — darauf setzen Steuerungs-
  und Körperdaten-Routes gemeinsam auf, unbekanntes Secret → 404. D1/KV-Bindings landen
  nie im Client-Bundle.
- **Körperdaten nur lesend, nur aus dem Archiv:** die Browser-Routes lesen über
  dasselbe `KoerperdatenArchive` wie die MCP-Tools, ohne Live-Abruf bei Garmin. Der Bereichs-Endpunkt liefert die
  bereits abgeleiteten Serien **und Kennzahlen** (`@shared/garmin/koerperdatenSerien`),
  nicht die Rohblobs.
- **Der Körperdaten-Index wird nicht in der Vue-Schicht gerechnet:** Verlauf, aktueller
  Stand und Beitragsaufschlüsselung kommen fertig aus `@shared/garmin/koerperdatenIndex`.
  Die gesamte Bewertungspolitik (Gewichte, Schwellen, Renormalisierung) liegt dort in
  `KALIBRIERUNG` an einer Stelle — eine Änderung fasst die Oberfläche nicht an. Die
  Fläche zeigt ihn als **Rechnung mit sichtbaren Bestandteilen**, nicht als Urteil, und
  beansprucht keine Tagesform-Einschätzung (`../docs/adr/0006-…`).
- **Ein Zeitraum für die ganze Fläche:** 30 / 90 / Alles, Standard 30, als
  `?zeitraum=`-Query in der URL (`shared/zeitraum.ts`). Charts und Kacheln folgen ihm
  gemeinsam; „Alles" beginnt am ersten archivierten Tag.
- **Charts clientseitig:** Chart.js über `vue-chartjs` hinter `ZeitreihenChart`; Farben
  kommen aus den CSS-Variablen von Nuxt UI, damit Hell/Dunkel ohne Sonderweg trägt.
  Der Wrapper trägt Linien, Flächen, (gestapelte) Balken und eine zweite y-Achse — was
  ein Verlauf braucht, wird dort ergänzt statt daran vorbei gebaut.
- **Kacheln ohne Client-JS:** die Mini-Kurven (`MiniKurve`) und das HRV-Baseline-Band
  (`BaselineBand`) sind serverseitig gerendertes Inline-SVG — sie stehen beim ersten
  Rendern da, ohne Chart-Bibliothek.
- **Eine `wrangler.jsonc` fürs ganze Repo:** sie liegt hier und beschreibt die
  Testumgebung `dev.training.pauldiepold.de` mit **eigener** D1 und eigenem KV.
  Bewusst **ohne** `triggers.crons` — der Cron ist gebaut, läuft aber nur in der
  Produktion; zwei Läufe gegen dieselben Garmin-Konten wären ein Rate-Limit-Risiko.
  Die Produktion bleibt bis zum Cutover (Issue #45) auf den alten Workern, weshalb
  `wrangler deploy` sie nicht versehentlich treffen kann.
- **Last-Write-Wins:** kein Konflikt-Handling zwischen Browser- und Agent-Schreibzugriff
  (ADR-0004).

## Entwicklung

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

`wrangler.jsonc` setzt `"remote": true` für KV und D1: auch im lokalen `nuxt dev`
(via `nitro-cloudflare-dev`) werden die **echten** dev-Ressourcen gelesen, nichts lokal
dupliziert. Erfordert wrangler-Auth (OAuth-Login bzw. `CLOUDFLARE_API_TOKEN`).

Aufruf eines Athleten: `/{view-secret}` (Dashboard), `/{view-secret}/steuerung`.

Den Cron lokal auslösen:

```bash
pnpm dev:cron     # nuxt build && wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+5+*+*+*"
```

## Build & Deploy

```bash
pnpm typecheck    # nuxt typecheck (vue-tsc)
pnpm deploy:dev   # nuxt build && wrangler deploy → dev.training.pauldiepold.de
```
