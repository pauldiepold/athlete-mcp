# Context Map – athlete-mcp

Ein selbst-gehosteter MCP-Server, der **pro Athlet** Trainingsdaten aus mehreren externen Quellen bereitstellt, damit Claude sie live lesen kann — auch vom Handy. Primär eine MCP-URL (`/{secret}/mcp`), fachlich in getrennte Kontexte zerlegt.

Alles läuft in **einem Nuxt-Deployable** ([ADR-0007](./docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md)): der MCP-Endpunkt ist eine Nitro-Route, die Weboberfläche liegt auf derselben Origin, der Körperdaten-Cron ist ein Nitro-Task. `src/` ist dabei eine **Domänen-Bibliothek ohne Framework-Bezug** — sie kennt weder Nitro noch MCP; die Verdrahtung (Tool-Registrierung, Routen, Task) liegt vollständig in `web/server/`. Unter dem per-User-Link liegen zwei Flächen — das **Körperdaten-Dashboard** (Startseite, rein lesende Verläufe aus dem Archiv) und die **Steuerung** (menschen-gerichtetes **Lesen + Editieren** von Steuerungsplan + Wochen, Markdown bleibt kanonisch), beide über das bestehende View-Secret authentifiziert. Dazu eine **Admin-/Operator-Ansicht** (GitHub-OAuth, nur der Betreiber). Die Weboberfläche importiert `SteuerungStore`/`TenantResolver`/`migrations` direkt aus `src/` — Single Source of Truth fürs Schema. Siehe [ADR-0004](./docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md) und [ADR-0005](./docs/adr/0005-admin-operator-surface-github-oauth.md).

Ausgelegt für mehrere Nutzer (Paul + Freunde). Provisioning ist manuell: pro Nutzer werden Credentials/Tokens lokal erzeugt und ins KV gelegt — kein Self-Service. Siehe [ADR-0001](./docs/adr/0001-athlete-mcp-ein-worker-mehrere-kontexte.md).

## Kontexte

- [Final Surge](./src/finalsurge/CONTEXT.md) — der vom Coach vorgegebene **Trainingsplan** (die Plan-Seite)
- [Garmin](./src/garmin/CONTEXT.md) — die täglichen **Körperdaten** (Physiologie/Recovery)
- [Steuerung](./src/steuerung/CONTEXT.md) — der vom Athleten **selbst geschriebene** Steuerungs-Store (Steuerungsplan + Wochen); eigenes Write-Modell, kein externer Connector

## Beziehungen

- **Read-Connectoren vs. eigenes Write-Modell.** Final Surge und Garmin sind reine, voneinander unabhängige Read-Connectoren zu je einer externen, inoffiziellen App-API. **Steuerung** ist die Ausnahme: das erste *eigene* Write-Modell des Workers (kein externer Connector). Ursprünglich agent-geschrieben im Single-Writer-Betrieb — mit dem Browser-Editing schreiben jetzt **Mensch und Agent** (Last-Write-Wins, siehe [ADR-0004](./docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md)). Alle Kontexte teilen nur die generische Server-Shell (Tool-Registrierung, KV-gestützter Auth-Cache) und die Mandanten-Identität.
- **Ein Deployable, eine Datenwahrheit.** MCP-Endpunkt, Weboberfläche und Cron liegen in einem Cloudflare-Worker mit **einer** `wrangler.jsonc` (in `web/`); vorher waren es zwei Worker mit duplizierten Binding-IDs. Der **Durable Object ist entfallen**: `McpAgent` hielt darin nur MCP-*Session*-Zustand, und alle zehn Tools sind reine Request/Response-Aufrufe gegen KV und D1, für die stateless Streamable HTTP funktional dasselbe leistet (Preis: keine langlaufenden Tools mit Progress-Updates). Gegen Drift schützt weiterhin der typgeprüfte Modul-Import aus `src/`, kein Cross-Repo-Vertrag. Die **Operator-Rolle** der Admin-Ansicht (GitHub-OAuth) ist von der Athleten-Identität getrennt, siehe [ADR-0005](./docs/adr/0005-admin-operator-surface-github-oauth.md). Auch `WEB_BASE_URL` ist entfallen: `get_dashboard_link` löst zur userId das View-Secret rückwärts auf und baut den Browser-Link aus der **Origin des Requests** — auf einer Origin gibt es nichts mehr zu konfigurieren.
  **Zwei Umgebungen, getrennte Daten:** `dev.training.pauldiepold.de` ist die Testumgebung mit **eigener D1 und eigenem KV** — die Fläche, auf der die OAuth-Umstellung verifiziert wird (Apple leitet später nicht auf localhost um). Sie trägt bewusst **keinen Cron**: zwei Läufe gegen dieselben Garmin-Konten wären ein unnötiges Rate-Limit-Risiko. Die Produktion läuft bis zum Cutover unverändert auf den alten Workern `athlete-mcp`/`athlete-web` — die bleiben deployt, werden aber nicht mehr aus diesem Repo gebaut.
- **Die Browser-Fläche liest zwei Kontexte, schreibt aber nur einen.** Sie ist nicht mehr allein eine Steuerungs-Fläche: das Dashboard liest **Körperdaten** aus dem Archiv (`KoerperdatenArchive` — derselbe Lesepfad wie hinter den MCP-Tools, kein zweiter) und leitet daraus über die reinen Module `koerperdatenSerien` und `koerperdatenIndex` Verläufe, Kennzahlen und den *Körperdaten-Index* ab; die Steuerungs-Fläche liest **und schreibt** Steuerungsplan + Wochen. Gegenüber Garmin bleibt sie rein lesend und **rein archiv-gestützt**: kein Live-Abruf aus den Browser-Routen, die inoffizielle API wird weiterhin nur aus den MCP-Tools und dem Cron angesprochen (ADR-0004 in Verbindung mit [src/garmin/ADR-0001](./src/garmin/docs/adr/0001-koerperdaten-live-api-archive-first.md)). Der **Körperdaten-Index** ist eine gerechnete Zahl und ausdrücklich nicht die *Tagesform*, siehe [ADR-0006](./docs/adr/0006-koerperdaten-index-gerechnete-zahl-neben-der-tagesform.md). Die beiden Kontexte berühren sich dort, wo ein Körperdaten-Tag in die Steuerungs-**Woche** führt: das reine Modul `isoWoche` rechnet ein Datum in den *Wochen-Key* um, den der Steuerungs-Store verlangt — die einzige Brücke zwischen Tag und Woche, und der einzige Ort dieser Kalender-Arithmetik.
- **Mandanten-Identität (geteilt):** Ein Pfad-Secret in der URL (`/{secret}/mcp`) identifiziert den Nutzer; das Mapping `pathsecret → userId` und alle Per-Nutzer-Credentials/Tokens liegen im KV. Die Steuerungs-Ansicht nutzt ein **getrenntes** `viewsecret → userId`; im Nuxt-Frontend gewährt dasselbe Secret **read+edit der eigenen Steuerung** (ADR-0004 lockert die ursprüngliche read-only-Eigenschaft aus [ADR-0003](./docs/adr/0003-read-only-browser-ansicht-zweite-surface.md)) — weiterhin eng auf *eine* Nutzer-Steuerung begrenzt, anders als das volle MCP-`pathsecret`. Siehe [ADR-0001](./docs/adr/0001-athlete-mcp-ein-worker-mehrere-kontexte.md).
  **Beschlossen, noch nicht gebaut:** beide Secrets fallen weg zugunsten von Google-OAuth plus einem Mapping `google:<sub> → userId`; `userId` selbst bleibt unverändert. Siehe [ADR-0007](./docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md).
- **Identität liegt im KV, Fachdaten liegen in D1.** Eine tragende Linie durchs ganze System: *wer ist wer und womit darf er wo rein* (`pathsecret:`, `viewsecret:`, `user:<id>:garmin`, `user:<id>:finalsurge`) steht im KV; *was hat er* (`koerperdaten`, `steuerungsplan`, `steuerung_woche`) steht in D1. Die Trennung überlebt die OAuth-Umstellung: das Identitäts-Mapping ersetzt im KV genau die Stelle, die `pathsecret:` freimacht.
- **Drei Datentypen, scharf getrennt:** Final Surge liefert ausschließlich den *Plan* (Workout), Garmin ausschließlich die *Körperdaten*. Der *absolvierte Lauf* (Ist) gehört keinem von beiden — er kommt über den Strava-Connector. Die Plan-vs-Ist-Trennung ist in [src/finalsurge/docs/adr/0001](./src/finalsurge/docs/adr/0001-nur-plan-keine-ist-daten.md) festgehalten.

## Sprache der geteilten Shell

Begriffe, die keinem einzelnen Kontext gehören, sondern der Server-Shell und der Identität.

**Athlet**:
Der Endnutzer, dessen Trainingsdaten das System bereitstellt.
_Avoid_: Nutzer, User, Mandant (letzteres beschreibt die *Eigenschaft* Mandantenfähigkeit, nie eine Person)

**Operator**:
Der Betreiber des Systems — provisioniert Athleten und sieht die Admin-Fläche. Eine von der Athleten-Identität vollständig getrennte Rolle.
_Avoid_: Admin, Betreiber

**userId**:
Die interne, stabile Kennung eines Athleten — sprechend (`paul`, `jonas`), vom Operator vergeben. Primärschlüssel in D1 und Präfix im KV. Überlebt jeden Wechsel des Anmeldeverfahrens.
_Avoid_: Account-ID, Nutzer-ID

**Invite-Code**:
Einmaliger, vom Operator erzeugter Code, der ein Athleten-Konto überhaupt erst entstehen lässt: eingelöst beim ersten Login, erzeugt das Identitäts-Mapping, danach verbraucht. Kein Code, kein Konto.
_Avoid_: Claim-Code, Einladungslink
