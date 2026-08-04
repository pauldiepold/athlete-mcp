# Context Map – athlete-mcp

Ein selbst-gehosteter MCP-Server (ein Cloudflare-Worker), der **pro Nutzer** Trainingsdaten aus mehreren externen Quellen bereitstellt, damit Claude sie live lesen kann — auch vom Handy. Primär eine MCP-URL (`/{secret}/mcp`), fachlich in getrennte Kontexte zerlegt. Der Worker bedient daneben eine schlichte, read-only HTML-Ansicht auf den Steuerungs-Store (eigenes View-Secret, [ADR-0003](./docs/adr/0003-read-only-browser-ansicht-zweite-surface.md)).

Im selben **Monorepo** entsteht zusätzlich ein **eigenständiges Nuxt-Frontend** als zweites Deploy-Target: unter dem per-User-Link liegen zwei Flächen — das **Körperdaten-Dashboard** (Startseite, rein lesende Verläufe aus dem Archiv) und die **Steuerung** (menschen-gerichtetes **Lesen + Editieren** von Steuerungsplan + Wochen, Markdown bleibt kanonisch), beide über das bestehende View-Secret authentifiziert. Dazu eine **Admin-/Operator-Ansicht** (GitHub-OAuth, nur der Betreiber). Es bindet dieselbe D1/KV und importiert `SteuerungStore`/`TenantResolver`/`migrations` direkt — Single Source of Truth fürs Schema. Siehe [ADR-0004](./docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md) und [ADR-0005](./docs/adr/0005-admin-operator-surface-github-oauth.md).

Ausgelegt für mehrere Nutzer (Paul + Freunde). Provisioning ist manuell: pro Nutzer werden Credentials/Tokens lokal erzeugt und ins KV gelegt — kein Self-Service. Siehe [ADR-0001](./docs/adr/0001-athlete-mcp-ein-worker-mehrere-kontexte.md).

## Kontexte

- [Final Surge](./src/finalsurge/CONTEXT.md) — der vom Coach vorgegebene **Trainingsplan** (die Plan-Seite)
- [Garmin](./src/garmin/CONTEXT.md) — die täglichen **Körperdaten** (Physiologie/Recovery)
- [Steuerung](./src/steuerung/CONTEXT.md) — der vom Athleten **selbst geschriebene** Steuerungs-Store (Steuerungsplan + Wochen); eigenes Write-Modell, kein externer Connector

## Beziehungen

- **Read-Connectoren vs. eigenes Write-Modell.** Final Surge und Garmin sind reine, voneinander unabhängige Read-Connectoren zu je einer externen, inoffiziellen App-API. **Steuerung** ist die Ausnahme: das erste *eigene* Write-Modell des Workers (kein externer Connector). Ursprünglich agent-geschrieben im Single-Writer-Betrieb — mit dem Browser-Editing schreiben jetzt **Mensch und Agent** (Last-Write-Wins, siehe [ADR-0004](./docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md)). Alle Kontexte teilen nur die generische Server-Shell (`McpAgent`, KV-gestützter Auth-Cache) und die Mandanten-Identität.
- **Zwei Deployables, eine Datenwahrheit.** MCP-Worker (Durable Object + Cron) und Nuxt-Frontend sind getrennte Deploy-Targets im selben Repo. Sie teilen sich D1 + KV und — entscheidend gegen Drift — dieselben TS-Module (`SteuerungStore`, `TenantResolver`, `migrations`). Die Kopplung ist damit ein typgeprüfter Modul-Import, kein Cross-Repo-Vertrag. Die **Operator-Rolle** der Admin-Ansicht (GitHub-OAuth) ist von der Athleten-Identität getrennt, siehe [ADR-0005](./docs/adr/0005-admin-operator-surface-github-oauth.md). Der MCP-Worker *ruft* das Web-Target nie auf, **verweist** aber darauf: `get_dashboard_link` löst zur userId das View-Secret rückwärts auf und gibt dem Athleten im Chat seinen eigenen Browser-Link. Der Host des Web-Targets steht dafür als `WEB_BASE_URL` in der wrangler-Config — die einzige Stelle, an der der MCP-Worker das andere Deployable kennt.
  **Beschlossen, noch nicht gebaut:** die beiden Deploy-Targets verschmelzen zu einem. `/mcp` wird eine Nitro-Route auf derselben Origin wie die Weboberfläche, der Durable Object entfällt (MCP stateless), und damit auch `WEB_BASE_URL`. Erzwungen wird das von der OAuth-Umstellung, siehe [ADR-0007](./docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md).
- **Das Web-Target liest zwei Kontexte, schreibt aber nur einen.** Es ist nicht mehr allein eine Steuerungs-Fläche: das Dashboard liest **Körperdaten** aus dem Archiv (`KoerperdatenArchive` — derselbe Lesepfad wie im MCP-Worker, kein zweiter) und leitet daraus über die reinen Module `koerperdatenSerien` und `koerperdatenIndex` Verläufe, Kennzahlen und den *Körperdaten-Index* ab; die Steuerungs-Fläche liest **und schreibt** Steuerungsplan + Wochen. Gegenüber Garmin bleibt es rein lesend und **rein archiv-gestützt**: kein Live-Abruf aus dem Frontend, die inoffizielle API hat weiterhin genau einen Aufrufer (ADR-0004 in Verbindung mit [src/garmin/ADR-0001](./src/garmin/docs/adr/0001-koerperdaten-live-api-archive-first.md)). Der **Körperdaten-Index** ist eine gerechnete Zahl und ausdrücklich nicht die *Tagesform*, siehe [ADR-0006](./docs/adr/0006-koerperdaten-index-gerechnete-zahl-neben-der-tagesform.md). Die beiden Kontexte berühren sich dort, wo ein Körperdaten-Tag in die Steuerungs-**Woche** führt: das reine Modul `isoWoche` rechnet ein Datum in den *Wochen-Key* um, den der Steuerungs-Store verlangt — die einzige Brücke zwischen Tag und Woche, und der einzige Ort dieser Kalender-Arithmetik.
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
