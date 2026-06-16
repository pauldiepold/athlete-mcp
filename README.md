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
(der MFA-Code bleibt immer interaktiv). Basis-URL überschreibbar via `--base-url`.

### Re-Seed

Ein erneuter Lauf für einen bestehenden Nutzer stellt einen abgerissenen
Garmin-Refresh-Token wieder her (KV-`put` ist Upsert) und verwendet das
vorhandene Pfad-Secret wieder — die MCP-URL des Nutzers bleibt stabil. Keine
Code-Änderung nötig.
