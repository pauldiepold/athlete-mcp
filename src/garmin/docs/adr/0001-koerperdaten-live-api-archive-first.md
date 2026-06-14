# Körperdaten: Live-API, archive-first, externes Token-Seeding

Garmin-Körperdaten werden über die **inoffizielle Connect-App-API als JSON** bezogen — nicht über den manuellen FIT-ZIP-Tagesexport. Sie werden **archive-first** gehalten: ein täglicher Cron schreibt die Körperdaten pro Nutzer in **D1**, das MCP-Tool liest aus D1 und holt fehlende Tage live nach. Die Auth wird **einmal extern geseedet** (lokales CLI, MFA interaktiv → OAuth-Token-Bündel ins KV); der Worker refresht nur noch.

> Der Discovery-Spike (Issue #4) hat Flow, Endpoints und Datenform gegen das echte Konto verifiziert — Details in [garmin-connect-api.md](../garmin-connect-api.md). Die Fixtures mit echten Körperdaten bleiben **lokal/gitignored** (nur die Struktur ist dokumentiert).

## Considered Options

- **Manuellen FIT-ZIP-Download automatisieren + FIT parsen** — verworfen: der Tages-Klick bliebe manuell, dazu komplexes Binär-Parsing. Die Live-API liefert dieselben Daten als sauberes JSON. (Die `.fit`-Exporte bleiben nur als lokale Referenz, sind gitignored.)
- **Live-Passthrough ohne Archiv** — verworfen: jede Claude-Frage hämmert die inoffizielle API, keine garantierte Historie, und bei einer Garmin-Sperre wäre die Vergangenheit verloren.
- **Passwort als Secret, Worker loggt sich selbst ein** (wie Final Surge) — verworfen: scheitert an Garmins MFA im headless Worker und legte das Passwort ins Backend.

## Consequences

- **Risiko inoffizielle API:** ToS-Grauzone, kann jederzeit brechen. Das Archiv (D1) entkoppelt die Historie von der Verfügbarkeit der API.
- **Token-Lebenszyklus (Spike-verifiziert):** Garmin nutzt das **DI-OAuth2-Modell**. Das Bündel ist `di_token` (kurzlebig, Bearer) + `di_refresh_token` (langlebig) + `di_client_id`. Der Worker refresht über einen **Standard-OAuth2-Refresh-Grant** (`POST diauth.garmin.com/di-oauth2-service/oauth/token`, `grant_type=refresh_token`) — headless, ohne MFA, ohne OAuth1. Reißt der Refresh-Token ab, ist ein erneuter lokaler Seed-Login nötig (MFA).
- **Seed-Login ist die fragile Stelle:** Garmin/Cloudflare rate-limitet den Login (429) und resettet curl-Impersonation-Verbindungen. Verlässlich war im Spike nur der Web-SSO-Embed-Flow. Das betrifft ausschließlich das einmalige CLI-Seeding, nicht den laufenden Worker (der nur refresht).
- **Garmin liefert nur Körperdaten, keine absolvierten Läufe** — die bleiben beim Strava-Connector (siehe [src/finalsurge/docs/adr/0001](../../../finalsurge/docs/adr/0001-nur-plan-keine-ist-daten.md)).
