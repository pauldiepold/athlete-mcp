\# Handoff: Final Surge MCP Server bauen



\## Ziel

Einen selbst-gehosteten MCP-Server bauen, der Pauls geplante Trainings aus

\*\*Final Surge\*\* (vom BTC-Coach gepflegt) abruft, damit Claude sie live lesen

kann – z. B. auf die Frage „Was steht diese Woche an?". Regelmäßige Nutzung,

auch mobil.



\## Stand jetzt

\- API-Recherche abgeschlossen, \*\*echte Endpunkte verifiziert\*\* anhand von

&#x20; funktionierendem Referenzcode (GitHub `alexandear/final-surge-bot`, Go).

\- Lauffähiger \*\*Python/FastMCP-Referenzentwurf\*\* existiert (siehe unten).

\- Hosting-Strategie durchdacht: \*\*Cloudflare Workers\*\* empfohlen.

\- Noch NICHT erledigt: Portierung nach TS, Deployment, Connector-Anbindung,

&#x20; Test mit echten Credentials.



\## Verifizierte Final Surge API (inoffiziell, App-API – stabil)

Base URL: `https://beta.finalsurge.com/api`



1\. \*\*Login\*\* — `POST /login`

&#x20;  Body JSON: `{ email, password, deviceManufacturer, deviceModel, deviceOperatingSystem }`

&#x20;  Antwort: `data.user\_key` + `data.token` (Bearer).

&#x20;  Statusfelder auf Top-Level: `success` (bool), `error\_number`, `error\_description`.



2\. \*\*Geplante Workouts\*\* — `GET /WorkoutList`

&#x20;  Query: `scope=USER`, `scopekey={user\_key}`, `startdate=YYYY-MM-DD`, `enddate=YYYY-MM-DD`

&#x20;  Header: `Authorization: Bearer {token}`

&#x20;  Antwort: `data\[]` mit je `workout\_date` (Format `2006-01-02T15:04:05`),

&#x20;  `description` (nullable – der Coach-Trainingstext), `activities\[]` mit

&#x20;  `activity\_type\_name`. Rest Day = genau eine Activity mit Name "Rest Day".



> Hinweis: Die dltHub-„Doku" (`/users`, `/workouts`) ist LLM-generiert und

> teils falsch. Verlass dich auf die obigen, aus echtem Code abgeleiteten

> Endpunkte.



\## Referenzcode (Python/FastMCP)

Vollständiger lauffähiger Entwurf liegt unter `server.py` im selben Verzeichnis

wie dieses Dokument (im Temp-Ordner der vorigen Session). Falls nicht mehr

vorhanden, neu generieren lassen – er enthält:

\- In-Memory Session-Cache mit 6h-TTL (nicht bei jedem Call neu einloggen)

\- `\_login`, `\_get\_session`, `\_fetch\_workouts`, `\_format\_workout`

\- Zwei Tools: `get\_planned\_workouts(start\_date, end\_date)` und

&#x20; `get\_upcoming\_workouts(days=7)`

\- Credentials via ENV: `FINAL\_SURGE\_EMAIL`, `FINAL\_SURGE\_PASSWORD`

\- stdio-Transport lokal, HTTP-Transport für gehostet (ENV `MCP\_TRANSPORT`)

Die Formatierungslogik (`\_format\_workout`) wurde mit Beispieldaten getestet

und funktioniert (normaler Workout + Rest Day).



\## Wie MCP hier funktioniert

\- Claude = Host. Connector im Account = Client. Pauls Server = MCP Server.

\- Server ist reiner Übersetzer + Credential-Halter: Final-Surge-Login-Daten

&#x20; bleiben serverseitig, Claude sieht nur die rauskommenden Workout-Daten.

\- Flow: Frage → Tool-Call → Server loggt ein (cached) → `/WorkoutList` →

&#x20; JSON → formatiert → Claude antwortet im Kontext des Marathonziels.



\## Hosting-Optionen (Paul hat: Cloudflare-Account + altes Shared Hosting)

\*\*Empfehlung: Cloudflare Workers.\*\*

\- Template: `npm create cloudflare@latest -- remote-mcp-server-authless --template=cloudflare/ai/demos/remote-mcp-authless`

\- Deploy: `wrangler deploy` → Endpoint `worker-name.account-name.workers.dev/mcp`

\- Free-Tier reicht. HTTPS automatisch. Serverless = kein Dauerprozess-Problem.

\- \*\*Trade-off:\*\* Workers laufen in \*\*JS/TS\*\*, nicht Python. Python-Entwurf muss

&#x20; portiert werden (Logik ist trivial: 1x POST, 1x GET, JSON mappen).



Shared Hosting nur als Fallback: Python/FastMCP über HTTP möglich, aber

langlebige Prozesse + eigener Port + TLS oft problematisch. Mehr Reibung.



\## Auth-Überlegung (wichtig)

\- Final-Surge-Credentials als Worker Secret: `wrangler secret put FINAL\_SURGE\_EMAIL` etc.

\- Zugriff auf den MCP-Server selbst schützen, sonst kann jeder mit der URL die

&#x20; Trainingsdaten abrufen:

&#x20; - \*\*Start/pragmatisch:\*\* statisches Bearer-Token in der Tool-Logik prüfen, URL privat halten.

&#x20; - \*\*Sauber (Overkill für Einzelnutzer):\*\* `workers-oauth-provider` von Cloudflare.



\## Vorgeschlagene Schritte (Laptop-Session)

1\. \*\*Lokal testen\*\* mit Python-Entwurf: ENV setzen, MCP Inspector, prüfen dass

&#x20;  Login + WorkoutList echte Coach-Workouts liefern → JSON-Schema gegen echte

&#x20;  Daten verifizieren (insb. Felder bei strukturierten Workouts/Intervallen).

2\. \*\*Nach TS portieren\*\* auf das Cloudflare-Worker-Template.

3\. \*\*Secrets\*\* setzen + simples Zugriffs-Token einbauen.

4\. \*\*`wrangler deploy`\*\*, `/mcp`-URL als Custom Connector in Claude eintragen.

5\. \*\*End-to-End-Test:\*\* „Was steht diese Woche an?" → Live-Abruf.



\## Offene Fragen / Risiken

\- JSON-Schema bei \*\*strukturierten Workouts\*\* (Intervalle, Pace-Targets) noch

&#x20; nicht gegen echte Daten geprüft – evtl. mehr Felder als `description` nötig.

\- Login per E-Mail/Passwort ist inoffiziell; bei 2FA/Captcha-Änderungen seitens

&#x20; Final Surge könnte es brechen. Token-Caching reduziert Login-Frequenz.

\- Prüfen ob Final Surge ToS die programmatische Nutzung der App-API einschränken.



\## Paul-Kontext (für sinnvolle Tool-Beschreibungen/Defaults)

\- Entwickler, 4 Jahre Erfahrung, Django + Vue/Nuxt, kommt mit Python \& TS klar.

\- Marathonziel: Valencia 07.12.2026, sub-2:30. BTC-Training Di/Do (Qualität).

\- Strava bereits als Connector verbunden (für absolvierte Läufe). Final Surge

&#x20; ergänzt die \*\*geplanten\*\* Coach-Workouts.



\## Suggested skills

\- \*\*frontend-design\*\* ist NICHT nötig (kein UI).

\- Falls als PRD/Issue gewünscht: \*\*to-prd\*\* zum Festhalten der Architektur.

\- Beim Coden auf dem Laptop: \*\*Claude Code\*\* mit dem Cloudflare-Worker-Repo;

&#x20; ggf. dltHub `rest-api-pipeline`-Toolkit ignorieren (zu generisch hier).

