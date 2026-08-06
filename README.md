# athlete-mcp

Selbst-gehosteter MCP-Server (ein Cloudflare-Worker, eine MCP-URL), der **pro
Nutzer** Trainingsdaten aus mehreren Quellen bereitstellt, damit Claude sie live
lesen kann — auch mobil. Fachlicher Überblick: [CONTEXT-MAP.md](./CONTEXT-MAP.md).

Seit [ADR-0007](./docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md)
ist alles **ein Deployable**: `web/` ist die Nuxt-App und enthält den MCP-Endpunkt
als Nitro-Route, die Weboberfläche und den Körperdaten-Cron als Nitro-Task. `src/`
ist die Domänen-Bibliothek ohne Framework-Bezug. Es gibt genau eine
`wrangler.jsonc`, und sie liegt in `web/`.

## Entwicklung

Im Repo-Root — deckt beide Testläufe und die Domänen-Bibliothek ab:

```bash
npm test           # Vitest (src/) + Vitest (web/)
npm run typecheck  # tsc --noEmit über src/
```

In `web/` — die App selbst:

```bash
pnpm dev           # Nuxt-Dev-Server gegen die dev-Ressourcen
pnpm typecheck     # nuxt typecheck
pnpm dev:cron      # Build + wrangler dev --test-scheduled (Cron lokal auslösen)
pnpm deploy:dev    # Build + Deploy nach dev.training.pauldiepold.de
```

Den Körperdaten-Cron lokal auslösen (`pnpm dev:cron` muss laufen):

```bash
curl "http://localhost:8787/__scheduled?cron=0+5+*+*+*"
```

> Wrangler wird über `npx`/die Paket-Scripts aufgerufen — keine globale Installation nötig.

### Umgebungen

`dev.training.pauldiepold.de` ist die Testumgebung mit **eigener D1 und eigenem
KV** und bewusst **ohne Cron** — zwei Läufe gegen dieselben Garmin-Konten wären
ein unnötiges Rate-Limit-Risiko.

Die Produktion läuft bis zum Cutover (Issue #45) unverändert auf den alten Workern
`athlete-mcp` und `athlete-web`: sie bleiben deployt, werden aber nicht mehr aus
diesem Repo gebaut. Daraus folgt zweierlei, solange das so ist:

- **Die lokalen CLIs (Onboarding, Probe, Backfill) bedienen ausschließlich die
  Testumgebung**, weil sie `web/wrangler.jsonc` benutzen. Sie haben deshalb bewusst
  keinen Schalter für die Umgebung: ein Flag hätte nur die *ausgegebene* URL
  verstellt, nicht das Ziel-KV. Wer die Produktion bedienen muss, tut das über die
  Config der alten Worker, nicht von hier aus.
- **Die Produktion ist aus diesem Repo nicht deploybar** — ein Hotfix an der alten
  Weboberfläche bräuchte deren Config zurück.

Das D1-Schema einer frischen Umgebung anlegen (in `web/`):

```bash
npx wrangler d1 migrations apply ATHLETE_DB --remote
```

Die Migrationen liegen im Repo-Root unter `migrations/`; `web/wrangler.jsonc`
zeigt über `migrations_dir` dorthin, damit beide Umgebungen dasselbe Schema
bekommen.

## Onboarding eines Nutzers

Provisioning ist manuell: pro Nutzer werden Credentials/Tokens einmalig **lokal**
erzeugt und in die Produktions-KV geschrieben — kein Self-Service. Das erledigt
das Onboarding-CLI:

```bash
npm run onboard -- --user <name>
```

Voraussetzungen:

- **wrangler ist angemeldet** (`npx wrangler login`) und schreibt in die echte
  KV (`--remote`, Binding `SESSION_KV` aus `web/wrangler.jsonc` — also in die
  Testumgebung, siehe oben).
- **[uv](https://docs.astral.sh/uv/)** ist installiert — der Garmin-Seed-Login
  läuft über einen `garminconnect`-Helper (`uv run scripts/seed_garmin_login.py`).

Ablauf (interaktiv, HITL):

1. **Final-Surge-Login** — Email + Passwort werden erfragt und durch einen echten
   Login verifiziert; gespeichert wird `user:<name>:finalsurge`.
2. **Garmin-Seed-Login** — Passwort + **MFA-Code** (Mail/App), einmalig. Der
   Worker bekommt nie das Garmin-Passwort, nur das DI-Token-Bündel
   (`user:<name>:garmin`) plus Profil (`user:<name>:garmin:profile`). Garmin
   rate-limitet den Login aggressiv (429) — der Helper toleriert das und
   versucht es mit Backoff mehrfach; einzelne 429-Hinweise sind normal.
3. **Pfad-Secret** — neu erzeugt oder bei Re-Seed wiederverwendet
   (`pathsecret:<secret>` → `<name>`).
4. Ausgabe der fertigen MCP-URL und des Browser-Links auf stdout —
   beide auf derselben Origin: `…/{pathsecret}/mcp` und `…/{viewsecret}`.

> **Veraltet ab Issue #43.** Die Schritte 3 und 4 beschreiben Secrets, die nichts mehr
> aufschließen: Der MCP-Endpunkt ist `/mcp` für alle und hängt am Bearer-Token aus dem
> eigenen Authorization Server, die Browser-Fläche an der Session. Der Connector wird in
> Claude mit der nackten Origin eingetragen; ein Konto entsteht über einen Invite-Code
> aus `/admin`. Das CLI schreibt die Einträge noch — sie fallen beim Aufräumen nach dem
> Cutover (Issue #46), zusammen mit diesem Absatz.

Optionale Env-Variablen statt interaktiver Eingabe:
`FINALSURGE_EMAIL`, `FINALSURGE_PASSWORD`, `GARMIN_EMAIL`, `GARMIN_PASSWORD`
(der MFA-Code bleibt immer interaktiv). Die Ziel-Umgebung steht als Konstantenpaar
oben in `scripts/onboard.ts` und wird zu Beginn jedes Laufs ausgegeben.

### Re-Seed (Onboarding)

Ein erneuter Lauf für einen bestehenden Nutzer stellt einen abgerissenen
Garmin-Refresh-Token wieder her (KV-`put` ist Upsert) und verwendet das
vorhandene Pfad-Secret wieder. Das Wiederherstellen des Garmin-Tokens ist der Grund,
aus dem der Re-Seed noch existiert; die MCP-URL hängt seit Issue #43 nicht mehr daran.
Keine Code-Änderung nötig.

## Körperdaten-Backfill

Ändert sich die Form der Körperdaten (zuletzt mit
[ADR-0002](./src/garmin/docs/adr/0002-koerperdaten-intraday-ereignisbasiert.md):
`training_readiness` vom Objekt zur Liste), tragen archivierte Zeilen noch die
alte Form. Zwei lokale CLIs ziehen sie nach — beide setzen wie das Onboarding
ein angemeldetes `npx wrangler login` voraus und sprechen KV und D1 der in
`web/wrangler.jsonc` konfigurierten Umgebung an.

**Erst prüfen**, was Garmin für ein altes Datum überhaupt noch liefert:

```bash
npm run probe:koerperdaten -- --user <name> --date 2026-06-20 [--json]
```

Die Probe schreibt nichts. Sie stellt die Live-Antwort der archivierten Zeile
Block für Block gegenüber und warnt, wenn ein Block live **fehlt**, der im
Archiv steht — der Backfill ersetzt die Zeile komplett, eine gealterte
Garmin-Antwort würde also Daten kosten.

**Dann schreiben:**

```bash
npm run backfill:koerperdaten -- --user <name> [--start YYYY-MM-DD] [--end YYYY-MM-DD] \
                                  [--delay 1200] [--yes]
```

- Ohne `--start`/`--end` läuft der gesamte archivierte Bereich des Nutzers.
- Bearbeitet werden **vorhandene Archivzeilen**, keine Kalenderlücken; Lücken zu
  füllen bleibt Sache der Read-through-Orchestrierung hinter den MCP-Tools.
- Zeilen, die bereits eine Liste tragen, werden übersprungen. Ein Lauf nach
  Fehlern holt damit von selbst nur das Fehlende nach.
- Vor dem Lauf läuft die Probe auf dem ältesten offenen Tag und fragt nach
  (`--yes` überspringt die Rückfrage).
- Abrufe laufen **sequentiell mit Pause** — die Connect-API ist inoffiziell und
  ratelimitet ([ADR-0001](./src/garmin/docs/adr/0001-koerperdaten-live-api-archive-first.md)).
  Ein Tag sind fünf Garmin-Endpoints plus ein D1-Schreibvorgang über einen
  wrangler-Subprozess; rechne mit rund fünf Sekunden pro Tag.
- Ein Fehler bricht den Lauf nicht ab; am Ende stehen die fehlgeschlagenen Tage
  und eine Verifikation, wie viele Zeilen im Bereich jetzt welche Form tragen.
