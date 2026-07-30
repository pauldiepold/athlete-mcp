# athlete-mcp

Selbst-gehosteter MCP-Server (ein Cloudflare-Worker, eine MCP-URL), der **pro
Nutzer** Trainingsdaten aus mehreren Quellen bereitstellt, damit Claude sie live
lesen kann — auch mobil. Fachlicher Überblick: [CONTEXT-MAP.md](./CONTEXT-MAP.md).

## Entwicklung

```bash
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run dev        # wrangler dev (lokaler Worker)
npm run deploy     # wrangler deploy
```

> Wrangler wird über `npx`/die npm-Scripts aufgerufen — keine globale Installation nötig.

## Onboarding eines Nutzers

Provisioning ist manuell: pro Nutzer werden Credentials/Tokens einmalig **lokal**
erzeugt und in die Produktions-KV geschrieben — kein Self-Service. Das erledigt
das Onboarding-CLI:

```bash
npm run onboard -- --user <name>
```

Voraussetzungen:

- **wrangler ist angemeldet** (`npx wrangler login`) und schreibt in die echte
  KV (`--remote`, Binding `SESSION_KV` aus `wrangler.jsonc`).
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
4. Ausgabe der fertigen MCP-URL auf stdout: `…/{secret}/mcp`.

Optionale Env-Variablen statt interaktiver Eingabe:
`FINALSURGE_EMAIL`, `FINALSURGE_PASSWORD`, `GARMIN_EMAIL`, `GARMIN_PASSWORD`
(der MFA-Code bleibt immer interaktiv). Die beiden Hosts sind überschreibbar via
`--base-url` (MCP-Worker) und `--web-base-url` (Nuxt-Target mit der Steuerung).

### Re-Seed (Onboarding)

Ein erneuter Lauf für einen bestehenden Nutzer stellt einen abgerissenen
Garmin-Refresh-Token wieder her (KV-`put` ist Upsert) und verwendet das
vorhandene Pfad-Secret wieder — die MCP-URL des Nutzers bleibt stabil. Keine
Code-Änderung nötig.

## Körperdaten-Backfill

Ändert sich die Form der Körperdaten (zuletzt mit
[ADR-0002](./src/garmin/docs/adr/0002-koerperdaten-intraday-ereignisbasiert.md):
`training_readiness` vom Objekt zur Liste), tragen archivierte Zeilen noch die
alte Form. Zwei lokale CLIs ziehen sie nach — beide setzen wie das Onboarding
ein angemeldetes `npx wrangler login` voraus und sprechen KV und D1 der
Produktion an.

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
  füllen bleibt Sache der Read-through-Orchestrierung im Worker.
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
