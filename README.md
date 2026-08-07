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

Die Produktion ist seit dem Cutover (Issue #45) `training.pauldiepold.de` und wird
wie die Testumgebung aus diesem Repo gebaut (`pnpm deploy:prod` in `web/`).

Die alten Worker `athlete-mcp` und `athlete-web` sind **noch deployt**, werden aber
nicht mehr aus diesem Repo gebaut und von keinem Code hier mehr bedient: Sie halten
den Zugang der Bestandsathleten offen, bis die auf die Anmeldung per Identität
umgezogen sind. Mit ihnen leben die `pathsecret:`- und `viewsecret:`-Einträge in der
alten KV weiter — sie sind der letzte Rest der alten Welt und werden zusammen mit den
Workern abgeräumt (Issue #56).

> **Die lokalen CLIs (Probe, Backfill) bedienen die in `web/wrangler.jsonc`
> konfigurierte Umgebung** und haben bewusst keinen Schalter dafür: Ein Flag hätte in
> der alten Fassung nur die *ausgegebene* URL verstellt, nicht das Ziel-KV — ein Lauf
> „für die Produktion" hätte still in die Testumgebung geschrieben.

Das D1-Schema einer frischen Umgebung anlegen (in `web/`):

```bash
npx wrangler d1 migrations apply ATHLETE_DB --remote
```

Die Migrationen liegen im Repo-Root unter `migrations/`; `web/wrangler.jsonc`
zeigt über `migrations_dir` dorthin, damit beide Umgebungen dasselbe Schema
bekommen.

## Ein Konto entsteht

Der Operator stellt in `/admin` einen **Invite-Code** aus — *frei* für ein neues
Konto, *kontogebunden* für einen Verfahrenswechsel an einem bestehenden. Der Athlet
löst ihn unter `/invite` ein, meldet sich per Google oder Apple an und richtet seine
**Verbindungen** zu Final Surge und Garmin unter `/einstellungen` selbst ein; den
Connector trägt er in Claude mit der nackten Origin ein. Kein CLI, keine
Geheim-URL, kein fremdes Passwort in der Konsole des Operators
([ADR-0007](./docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md)).

Der **allererste** Code muss von Hand ins KV: Ohne Konto kein `/admin`, ohne
`/admin` kein Code.

Das alte Onboarding-CLI liegt unter [`archive/`](./archive/) — nicht mehr
aufgerufen und nicht mehr gepflegt, aber als Recherche-Grundlage aufbewahrt,
falls Garmin seinen Login-Pfad dreht.

## Körperdaten-Backfill

Ändert sich die Form der Körperdaten (zuletzt mit
[ADR-0002](./src/garmin/docs/adr/0002-koerperdaten-intraday-ereignisbasiert.md):
`training_readiness` vom Objekt zur Liste), tragen archivierte Zeilen noch die
alte Form. Zwei lokale CLIs ziehen sie nach — beide setzen ein angemeldetes
`npx wrangler login` voraus und sprechen KV und D1 der in `web/wrangler.jsonc`
konfigurierten Umgebung an.

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
