# web

**Das** Deployable des Projekts (ADR-0007): Nuxt-Oberfläche, MCP-Endpunkt und
Körperdaten-Cron in einem Cloudflare-Worker. Vorher lag der MCP-Teil in einem eigenen
Worker daneben.

- **MCP-Endpunkt** (`/mcp`) — Nitro-Route, stateless Streamable HTTP, kein Durable
  Object (`server/routes/mcp.ts`, Tools in `server/utils/mcpServer.ts`). Eine URL für
  alle Athleten; wer fragt, sagt das Bearer-Token.
- **OAuth-Authorization-Server** — `worker/index.ts` ist die `main` des Workers und
  legt `@cloudflare/workers-oauth-provider` vor Nitros Bundle (Issue #43). Discovery,
  DCR und `/oauth/token` bringt der Provider mit; die Consent-Fläche liegt als
  gewöhnliche Nuxt-Seite unter `/authorize`.
- **Körperdaten-Cron** — Nitro-Task (`server/tasks/koerperdaten.ts`); die Fachlichkeit
  liegt in `@shared/garmin/koerperdatenCron`.

Dazu zwei Athleten-Flächen hinter der Session, für alle unter denselben Pfaden,
umschaltbar über die Kopfzeile:

- **Dashboard** (`/`) — die Startseite: abgemeldet die Anmeldung, angemeldet die
  Verläufe der **Körperdaten** aus dem Archiv, rein lesend. Solange ein Pflichtschritt
  der **Einrichtung** offen ist (Connector, Onboarding), steht dort an seiner Stelle
  die Einrichtung; ist sie durch, aber das Archiv leer, der Hinweis zum jeweiligen
  *Startseiten-Zustand*.
- **Steuerung** (`/steuerung`) — Steuerungsplan + Wochen, lesen und editieren;
  Markdown bleibt das kanonische Speicherformat, byte-genau das, was der Agent über
  MCP liest/schreibt.

Siehe `../docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md`
und `../docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md`.

## Architektur (Kurz)

- **Geteilte Module statt Duplikat:** `SteuerungStore` und die Identitäts-Funktionen
  werden via `@shared`-Alias direkt aus `../src` importiert — Single Source of Truth
  fürs Schema, keine Drift (`nuxt.config.ts`).
- **Auth server-seitig, an einer Stelle — aber zwei Ausweise:** Die Browser-Flächen
  hängen an der **Session** (`resolveAthlet`), der MCP-Endpunkt am **Bearer-Token**
  (`resolveMcpAthlet`, Identität aus den Grant-`props`). Beides liegt in
  `server/utils/athlet.ts`, bewusst als zwei Funktionen ohne gemeinsames Flag: ein
  vertauschtes Argument wäre eine stille Rechteausweitung. Kein Ausweis → 401.
  D1/KV-Bindings landen nie im Client-Bundle.
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
- **Was die Startseite zeigt, ist eine reine Funktion:** `shared/startseitenZustand.ts`
  (Reihenfolge der fünf Fälle) und `shared/einrichtung.ts` (Reihenfolge der vier
  Schritte, und welche davon Pflicht sind). Beide sind getestet und kennen keine Texte
  — die stehen in den Komponenten. Jeder Haken der Einrichtung ist **abgeleitet**:
  Verbindungen aus dem KV, der Connector aus `listUserGrants`, das Onboarding aus dem
  vorhandenen Steuerungsplan; gespeichert oder quittiert wird nichts.
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
- **Eine `wrangler.jsonc` fürs ganze Repo:** sie liegt hier. Die **Top-Level-Config
  ist die Testumgebung** `dev.training.pauldiepold.de` mit **eigener** D1 und eigenem
  KV, bewusst **ohne** `triggers.crons` — zwei Läufe gegen dieselben Garmin-Konten
  wären ein Rate-Limit-Risiko. Die Produktion `training.pauldiepold.de` steht in
  `env.production` und braucht das ausdrückliche `--env production` (`deploy:prod`):
  Ein `wrangler deploy` ohne Flag trifft weiter dev.
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

**`pnpm dev` kennt den OAuth-Wrapper nicht.** Der Nitro-Dev-Server startet Nuxt direkt,
also läuft `worker/index.ts` nicht mit: `/mcp` antwortet mangels Grant-Props 401 und
`/authorize` mit einem 500er, der genau das sagt. Alles, was den Authorization Server
berührt, wird über `pnpm dev:cron` (das baut und startet `wrangler dev`) oder auf
`dev.training.pauldiepold.de` geprüft — den vollen Durchlauf mit claude.ai ohnehin nur
dort, weil Claude eine erreichbare Origin braucht.

```bash
pnpm dev:cron     # nuxt build && wrangler dev --test-scheduled

# Cron hinter dem Wrapper:
curl "http://localhost:8787/__scheduled?cron=0+5+*+*+*"

# Der Anfang des OAuth-Flows:
curl -i -X POST http://localhost:8787/mcp          # 401 + www-authenticate
curl http://localhost:8787/.well-known/oauth-authorization-server
```

## Build & Deploy

```bash
pnpm typecheck    # nuxt typecheck (vue-tsc)
pnpm deploy:dev   # nuxt build && wrangler deploy → dev.training.pauldiepold.de
```
