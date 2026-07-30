# athlete-web

Eigenständiges **Nuxt-Frontend** und zweites Cloudflare-Deploy-Target neben dem
MCP-Worker (`../`). Der Athlet liest und editiert seine **Steuerung** (Steuerungsplan
+ Wochen) im Browser; Markdown bleibt das kanonische Speicherformat, byte-genau das,
was der Agent über MCP liest/schreibt.

Siehe `../docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md`.

## Architektur (Kurz)

- **Geteilte Module statt Duplikat:** `SteuerungStore` und `TenantResolver` werden via
  `@shared`-Alias direkt aus `../src` importiert — Single Source of Truth fürs Schema,
  keine Drift (`nuxt.config.ts`).
- **Auth server-seitig:** Das per-User **View-Secret** aus der URL wird im Nitro-Server
  aufgelöst (`server/utils/steuerung.ts`); D1/KV-Bindings landen nie im Client-Bundle.
- **Gleiche Bindings wie der MCP-Worker:** identische `binding`-Namen und `id`s in
  `wrangler.jsonc` → dasselbe physische D1/KV. Das Web-Target hat bewusst **keine**
  Durable Objects, Crons oder Migrations (die bleiben beim MCP-Worker).
- **Last-Write-Wins:** kein Konflikt-Handling zwischen Browser- und Agent-Schreibzugriff
  (ADR-0004).

## Entwicklung

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

`wrangler.jsonc` setzt `"remote": true` für KV und D1: auch im lokalen `nuxt dev`
(via `nitro-cloudflare-dev`) werden die **echten** Cloudflare-Ressourcen gelesen,
nichts lokal dupliziert. Erfordert wrangler-Auth (OAuth-Login bzw. `CLOUDFLARE_API_TOKEN`).

Aufruf einer Steuerung: `/{view-secret}/steuerung`.

## Build & Deploy

```bash
pnpm typecheck    # nuxt typecheck (vue-tsc)
pnpm deploy       # nuxt build && wrangler deploy
```
