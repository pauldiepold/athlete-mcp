# Context Map – athlete-mcp

Ein selbst-gehosteter MCP-Server, der **pro Athlet** Trainingsdaten aus mehreren externen Quellen bereitstellt, damit Claude sie live lesen kann — auch vom Handy. Primär eine MCP-URL (`/mcp`) — seit [ADR-0007](./docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md) für **alle Athleten dieselbe**, weil die Identität im Bearer-Token steckt statt im Pfad —, fachlich in getrennte Kontexte zerlegt.

Alles läuft in **einem Nuxt-Deployable** ([ADR-0007](./docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md)): der MCP-Endpunkt ist eine Nitro-Route, die Weboberfläche liegt auf derselben Origin, der Körperdaten-Cron ist ein Nitro-Task. `src/` ist dabei eine **Domänen-Bibliothek ohne Framework-Bezug** — sie kennt weder Nitro noch MCP; die Verdrahtung (Tool-Registrierung, Routen, Task) liegt vollständig in `web/server/`. Die Weboberfläche trägt zwei Flächen — das **Körperdaten-Dashboard** (Startseite, rein lesende Verläufe aus dem Archiv) und die **Steuerung** (menschen-gerichtetes **Lesen + Editieren** von Steuerungsplan + Wochen, Markdown bleibt kanonisch), beide hinter der **Session** des angemeldeten Athleten; die Pfade sind für alle gleich (`/`, `/steuerung`, `/tag/…`) und tragen kein Secret mehr. Dazu eine **Admin-/Operator-Ansicht** unter derselben Anmeldung, freigeschaltet über eine Allowlist von Google-`sub`. Die Weboberfläche importiert `SteuerungStore`/`identitaet`/`migrations` direkt aus `src/` — Single Source of Truth fürs Schema. (`TenantResolver` stand hier, solange ein Secret in der URL die Identität trug; mit dem Bearer-Token ist er ersatzlos entfallen.) Siehe [ADR-0004](./docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md) und [ADR-0005](./docs/adr/0005-admin-operator-surface-github-oauth.md).

Ausgelegt für mehrere Athleten (Paul + Freunde). Ein **Konto entsteht ausschließlich durch Einlösen eines Invite-Codes**, den der Operator in `/admin` ausstellt; die Datenquellen verbindet der Athlet danach selbst (Issue #44). Die Credentials der Datenquellen liegen weiterhin pro Athlet im KV. Siehe [ADR-0001](./docs/adr/0001-athlete-mcp-ein-worker-mehrere-kontexte.md).

## Kontexte

- [Final Surge](./src/finalsurge/CONTEXT.md) — der vom Coach vorgegebene **Trainingsplan** (die Plan-Seite)
- [Garmin](./src/garmin/CONTEXT.md) — die täglichen **Körperdaten** (Physiologie/Recovery)
- [Steuerung](./src/steuerung/CONTEXT.md) — der vom Athleten **selbst geschriebene** Steuerungs-Store (Steuerungsplan + Wochen); eigenes Write-Modell, kein externer Connector

## Beziehungen

- **Read-Connectoren vs. eigenes Write-Modell.** Final Surge und Garmin sind reine, voneinander unabhängige Read-Connectoren zu je einer externen, inoffiziellen App-API. **Steuerung** ist die Ausnahme: das erste *eigene* Write-Modell des Workers (kein externer Connector). Ursprünglich agent-geschrieben im Single-Writer-Betrieb — mit dem Browser-Editing schreiben jetzt **Mensch und Agent** (Last-Write-Wins, siehe [ADR-0004](./docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md)). Alle Kontexte teilen nur die generische Server-Shell (Tool-Registrierung, KV-gestützter Auth-Cache) und die Mandanten-Identität.
- **Ein Deployable, eine Datenwahrheit.** MCP-Endpunkt, Weboberfläche und Cron liegen in einem Cloudflare-Worker mit **einer** `wrangler.jsonc` (in `web/`); vorher waren es zwei Worker mit duplizierten Binding-IDs. Die `main` des Workers ist seit Issue #43 nicht mehr Nitros Bundle, sondern `web/worker/index.ts`: der **OAuthProvider umschließt Nitro**, das generierte `.output/server/index.mjs` wird unverändert als `defaultHandler` *und* als `apiHandler` für `/mcp` durchgereicht. Damit bleibt der MCP-Endpunkt eine gewöhnliche Nitro-Route mit Zugriff auf `server/utils/` und den `@shared`-Alias, und die Consent-Fläche liegt als Nuxt-Seite dort, wo alle anderen Flächen liegen. Nitro-Output wird nie gepatcht — das war das Abbruchkriterium des Spikes #37 und wurde nie berührt. Der Cron geht am Provider vorbei direkt an Nitros `scheduled`, daneben räumt `purgeExpiredData()` den Grant-Store auf. Der **Durable Object ist entfallen**: `McpAgent` hielt darin nur MCP-*Session*-Zustand, und alle zehn Tools sind reine Request/Response-Aufrufe gegen KV und D1, für die stateless Streamable HTTP funktional dasselbe leistet (Preis: keine langlaufenden Tools mit Progress-Updates). Gegen Drift schützt weiterhin der typgeprüfte Modul-Import aus `src/`, kein Cross-Repo-Vertrag. Die **Operator-Rolle** der Admin-Ansicht läuft seit ADR-0007 über dieselbe Anmeldung wie die des Athleten — ein Login, zwei Rollen; die GitHub-OAuth aus [ADR-0005](./docs/adr/0005-admin-operator-surface-github-oauth.md) ist entfallen. Auch `WEB_BASE_URL` ist entfallen: `get_dashboard_link` baut den Browser-Link aus der **Origin des Requests** — auf einer Origin gibt es nichts mehr zu konfigurieren, und seit die Anmeldung eine Session ist, sind die Pfade darunter für alle gleich.
  **Zwei Umgebungen, getrennte Daten:** `dev.training.pauldiepold.de` ist die Testumgebung mit **eigener D1 und eigenem KV** — die Fläche, auf der die OAuth-Umstellung verifiziert wird (Apple leitet später nicht auf localhost um). Sie trägt bewusst **keinen Cron**: zwei Läufe gegen dieselben Garmin-Konten wären ein unnötiges Rate-Limit-Risiko. Die Produktion läuft bis zum Cutover unverändert auf den alten Workern `athlete-mcp`/`athlete-web` — die bleiben deployt, werden aber nicht mehr aus diesem Repo gebaut.
- **Die Browser-Fläche liest zwei Kontexte, schreibt aber nur einen.** Sie ist nicht mehr allein eine Steuerungs-Fläche: das Dashboard liest **Körperdaten** aus dem Archiv (`KoerperdatenArchive` — derselbe Lesepfad wie hinter den MCP-Tools, kein zweiter) und leitet daraus über die reinen Module `koerperdatenSerien` und `koerperdatenIndex` Verläufe, Kennzahlen und den *Körperdaten-Index* ab; die Steuerungs-Fläche liest **und schreibt** Steuerungsplan + Wochen. Gegenüber Garmin bleibt sie rein lesend und **rein archiv-gestützt**: kein Live-Abruf aus den Browser-Routen, die inoffizielle API wird weiterhin nur aus den MCP-Tools und dem Cron angesprochen (ADR-0004 in Verbindung mit [src/garmin/ADR-0001](./src/garmin/docs/adr/0001-koerperdaten-live-api-archive-first.md)). Der **Körperdaten-Index** ist eine gerechnete Zahl und ausdrücklich nicht die *Tagesform*, siehe [ADR-0006](./docs/adr/0006-koerperdaten-index-gerechnete-zahl-neben-der-tagesform.md). Die beiden Kontexte berühren sich dort, wo ein Körperdaten-Tag in die Steuerungs-**Woche** führt: das reine Modul `isoWoche` rechnet ein Datum in den *Wochen-Key* um, den der Steuerungs-Store verlangt — die einzige Brücke zwischen Tag und Woche, und der einzige Ort dieser Kalender-Arithmetik.
- **Identität (geteilt):** Der Athlet meldet sich mit **Google oder Apple** an; das Mapping `<provider>:<sub> → userId` liegt im KV, an genau der Stelle, die `pathsecret:` freimacht. Der Anker ist der Provider-`sub`, **nicht** die E-Mail-Adresse — die ist ein Attribut im Profil (`user:<id>:profile`, zusammen mit Anzeigename, Verfahren und `sub`) und wird zur Auflösung nie herangezogen. **Ein Konto hat genau eine aktive Identität**; ein kontogebundener Invite-Code ersetzt sie (Verfahrenswechsel), ein freier legt ein neues Konto mit generierter, opaker `userId` an. Die Browser-Fläche hängt an der Session, die Operator-Rolle an `NUXT_OPERATOR_SUBS`. Siehe [ADR-0007](./docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md).
  **Auch der MCP-Endpunkt hängt daran** (Issue #43): athlete-mcp ist sein eigener **OAuth-2.1-Authorization-Server** auf derselben Origin — Discovery, Dynamic Client Registration, `/authorize` mit PKCE, `/token` mit Refresh. Claude bekommt ein Bearer-Token statt einer Geheim-URL, und `/mcp` ist für alle Athleten dieselbe Adresse. Der **Grant trägt ausschließlich die `userId`**: Anzeigename und Verbindungen werden pro Request frisch gelesen, damit ein jahrealter Token keinen veralteten Stand einfriert. Die alten `pathsecret:`- und `viewsecret:`-Einträge sind damit funktionslos und sterben mit dem Cutover (Issue #46).
- **Identität liegt im KV, Fachdaten liegen in D1.** Eine tragende Linie durchs ganze System: *wer ist wer und womit darf er wo rein* (`google:<sub>`, `apple:<sub>`, `invite:<code>`, `user:<id>:profile`, `user:<id>:garmin`, `user:<id>:finalsurge`) steht im KV; *was hat er* (`koerperdaten`, `steuerungsplan`, `steuerung_woche`) steht in D1. Die Trennung hat die OAuth-Umstellung überlebt, ohne dass eine Zeile in D1 gewandert wäre: Das Identitäts-Mapping ersetzt im KV genau die Stelle, die `pathsecret:` freimacht.
  Der **Grant-Store des Authorization Servers** liegt daneben, aber in einem **eigenen** KV-Namespace (`OAUTH_KV`, verwaltet von `@cloudflare/workers-oauth-provider`): Er ist die Menge aller gültigen Connector-Zugänge und gehört nicht in denselben Topf wie Sessions und Athleten-Credentials. Getrennt nach Umgebung ist er ohnehin — ein in dev ausgestellter Token findet auf prod keinen Grant.
- **Drei Datentypen, scharf getrennt:** Final Surge liefert ausschließlich den *Plan* (Workout), Garmin ausschließlich die *Körperdaten*. Der *absolvierte Lauf* (Ist) gehört keinem von beiden — er kommt über den Strava-Connector. Die Plan-vs-Ist-Trennung ist in [src/finalsurge/docs/adr/0001](./src/finalsurge/docs/adr/0001-nur-plan-keine-ist-daten.md) festgehalten.

## Sprache der geteilten Shell

Begriffe, die keinem einzelnen Kontext gehören, sondern der Server-Shell und der Identität.

**Athlet**:
Der Endnutzer, dessen Trainingsdaten das System bereitstellt.
_Avoid_: Nutzer, User, Mandant (letzteres beschreibt die *Eigenschaft* Mandantenfähigkeit, nie eine Person)

**Operator**:
Der Betreiber des Systems — provisioniert Athleten und sieht die Admin-Fläche. Eine von der Athleten-Identität vollständig getrennte Rolle.
_Avoid_: Admin, Betreiber

**Konto**:
Die `userId` samt Fachdaten in D1 und Einträgen im KV. Entsteht ausschließlich durch Einlösen eines Invite-Codes.
_Avoid_: Account

**userId**:
Die interne, stabile Kennung eines Kontos. Bei den Bestandskonten sprechend (`paul`, `jonas`), bei neuen generiert und opak — ein freier Invite-Code kennt kein Konto, also kann niemand vorher einen Namen vergeben. Primärschlüssel in D1 und Präfix im KV. Überlebt jeden Wechsel des Anmeldeverfahrens; enthält nie ein `:` (das Token-Format des OAuth-Providers ist `userId:grantId:secret`). Lesbarkeit liefert der Anzeigename, nicht der Schlüssel.
_Avoid_: Account-ID, Nutzer-ID

**Identität**:
`<provider>:<sub>` — der Anker der Anmeldung, im KV auf eine `userId` abgebildet. Ein Konto hat immer genau eine aktive.
_Avoid_: Login, Account

**Anmeldeverfahren**:
Google oder Apple, also die Sorte einer Identität. Der Athlet wählt es beim Einlösen des Invite-Codes; ein neuer kontogebundener Code wechselt es.
_Avoid_: Provider (im Gespräch über Athleten), Login-Methode

**Profil**:
`user:<id>:profile` — Anzeigename, E-Mail, Verfahren und `sub` eines Kontos. Ausschließlich **Anzeige-Material**: Die Identitäts-Auflösung liest nur `<provider>:<sub>` und befragt das Profil nie.
_Avoid_: Stammdaten, Account-Daten

**Invite-Code**:
Einmaliger, vom Operator erzeugter Code, ohne den kein Konto entsteht. **Frei** legt beim Einlösen ein neues Konto an; **kontogebunden** hängt die Identität an ein bestehendes Konto und ersetzt dessen bisherige (der *Verfahrenswechsel*). Einlösen löscht den Code und die übrigen offenen Codes desselben Kontos; offene Codes verfallen nach 14 Tagen.
_Avoid_: Claim-Code, Einladungslink

**Client**:
Eine Anwendung, die per OAuth Zugriff auf ein Konto will — praktisch Claude. Registriert sich selbst (Dynamic Client Registration); Name und Links stammen aus dieser Selbstregistrierung und sind ungeprüft. **Nicht** der Athlet und **nicht** eine der Datenquellen: Final Surge und Garmin sind Verbindungen, für die *wir* der Client sind.
_Avoid_: App, Connector (das ist die Sicht des Athleten), Nutzer

**Grant**:
Die vom Athleten erteilte Zustimmung, dass ein Client auf sein Konto zugreifen darf — der Gegenstand, den ein Bearer-Token vorweist. Lebt im `OAUTH_KV`, bis er gelöscht wird; sein Widerruf ist der einzige Weg, einen Connector zu trennen. Trägt als `props` **ausschließlich die `userId`**, damit nichts Veränderliches darin einfriert.
_Avoid_: Berechtigung, Freigabe (das ist die *Handlung* auf dem Consent-Screen), Token

**Consent-Screen**:
`/authorize` — die Nuxt-Seite, auf der der Athlet sieht, wer zugreifen will und worauf, und entscheidet. Erscheint bei **jeder** Autorisierung; praktisch einmal pro Connector-Einrichtung.
_Avoid_: Zustimmungsdialog, Berechtigungsseite
