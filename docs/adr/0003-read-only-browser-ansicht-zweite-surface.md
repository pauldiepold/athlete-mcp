# Read-only Browser-Ansicht als zweite Worker-Surface mit eigenem View-Secret

Status: superseded by [ADR-0004](./0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md) und [ADR-0007](./0007-oauth-identitaet-statt-url-secrets-ein-deployable.md) — **die hier beschriebene HTML-Ansicht existiert nicht mehr.**

Was wann fiel:

- **ADR-0004** löste die hier verworfene Option „separates Frontend" und den offenen Single-Writer-Punkt auf (eigenständiges Nuxt-Frontend, Browser-Editing, Last-Write-Wins) und lockerte die **read-only-Eigenschaft des View-Secrets**: im Frontend gewährt dasselbe Secret read+edit der eigenen Steuerung (weiterhin enger als das volle MCP-`pathsecret`). Die schlichte HTML-Ansicht im Worker blieb damals bewusst daneben bestehen.
- **ADR-0007** hat sie ersatzlos entfernt. Mit einem einzigen Deployable lagen dieselben Daten unter zwei Rendering-Pfaden auf einer Origin — der schlichte HTML-Pfad hatte keinen Zweck mehr, den die Nuxt-Fläche nicht besser erfüllt, und wäre bei der OAuth-Umstellung eine zweite Fläche gewesen, die man mit absichern muss. Die Routen `/{secret}/steuerung` und `/{secret}/steuerung/{kw}` gibt es weiterhin, sie kommen jetzt aber aus Nuxt.

Das **View-Secret als getrenntes Auth-Artefakt** überlebt dieses ADR und stirbt erst mit der OAuth-Umstellung (ADR-0007).

Der historische Text folgt unverändert.

Der Worker bekommt eine **menschen-gerichtete, read-only HTML-Ansicht** auf den Steuerungs-Store (`/{secret}/steuerung` = Steuerungsplan + Wochenliste, `/{secret}/steuerung/{kw}` = eine Woche). Damit ist er nicht mehr *reiner* MCP-Endpunkt (vgl. [ADR-0001](./0001-athlete-mcp-ein-worker-mehrere-kontexte.md)), sondern bedient eine **zweite Surface**. Diese wird über ein **eigenes, read-only View-Secret** authentifiziert (`viewsecret:<secret> → userId` im KV), getrennt vom MCP-Pfad-Secret. Serverseitig gerendert (Markdown→HTML via `marked` + Inline-CSS), kein Frontend/Build.

## Considered Options

- **Separates Frontend (SPA/Pages) + JSON-API** — verworfen: zweites Deploy-Target, Build-Pipeline, CORS und Secret im Browser-Bundle; massiver Overhead für eine schlichte Lese-Ansicht.
- **MCP-Pfad-Secret wiederverwenden** (`/{mcpSecret}/steuerung`) — verworfen: das MCP-Secret gewährt vollen **Schreib**-Zugriff über alle Kontexte. In einer Browser-URL landet es in History/Referer/Screenshots; ein Leak wäre ein voller MCP-Kompromiss. Das eigene View-Secret grenzt den Blast-Radius auf „Steuerung lesen" ein.
- **Nur rohes Markdown ausliefern** (`text/plain`) — verworfen: im Browser unschön, keine Navigation.

## Consequences

- **Zweites Auth-Artefakt pro Nutzer.** Das Onboarding-Seeding (`src/cli/seeding.ts`) legt zusätzlich einen `viewsecret:`-Key an; der `TenantResolver` löst diesen Namespace getrennt auf.
- **Code lebt im Steuerung-Kontext.** Die Ansicht ist eine Read-Surface von Steuerung, kein neuer Kontext — Rendering/Routing in `src/steuerung/`, kein generischer Web-Layer (YAGNI bis ein zweiter Kontext eine Ansicht braucht).
- **Offener Punkt — Single-Writer.** `src/steuerung/CONTEXT.md` postuliert die Invariante „Single-Writer (nur der Agent)". Die Lese-Ansicht ist konform. Das mittelfristig gewünschte **Editieren im Browser** würde diese Invariante brechen (zweiter Writer) und braucht zu diesem Zeitpunkt einen eigenen ADR (Konfliktauflösung Agent vs. Mensch).
