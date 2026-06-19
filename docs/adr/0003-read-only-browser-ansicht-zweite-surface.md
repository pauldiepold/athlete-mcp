# Read-only Browser-Ansicht als zweite Worker-Surface mit eigenem View-Secret

Der Worker bekommt eine **menschen-gerichtete, read-only HTML-Ansicht** auf den Steuerungs-Store (`/{secret}/steuerung` = Steuerungsplan + Wochenliste, `/{secret}/steuerung/{kw}` = eine Woche). Damit ist er nicht mehr *reiner* MCP-Endpunkt (vgl. [ADR-0001](./0001-athlete-mcp-ein-worker-mehrere-kontexte.md)), sondern bedient eine **zweite Surface**. Diese wird über ein **eigenes, read-only View-Secret** authentifiziert (`viewsecret:<secret> → userId` im KV), getrennt vom MCP-Pfad-Secret. Serverseitig gerendert (Markdown→HTML via `marked` + Inline-CSS), kein Frontend/Build.

## Considered Options

- **Separates Frontend (SPA/Pages) + JSON-API** — verworfen: zweites Deploy-Target, Build-Pipeline, CORS und Secret im Browser-Bundle; massiver Overhead für eine schlichte Lese-Ansicht.
- **MCP-Pfad-Secret wiederverwenden** (`/{mcpSecret}/steuerung`) — verworfen: das MCP-Secret gewährt vollen **Schreib**-Zugriff über alle Kontexte. In einer Browser-URL landet es in History/Referer/Screenshots; ein Leak wäre ein voller MCP-Kompromiss. Das eigene View-Secret grenzt den Blast-Radius auf „Steuerung lesen" ein.
- **Nur rohes Markdown ausliefern** (`text/plain`) — verworfen: im Browser unschön, keine Navigation.

## Consequences

- **Zweites Auth-Artefakt pro Nutzer.** Das Onboarding-Seeding (`src/cli/seeding.ts`) legt zusätzlich einen `viewsecret:`-Key an; der `TenantResolver` löst diesen Namespace getrennt auf.
- **Code lebt im Steuerung-Kontext.** Die Ansicht ist eine Read-Surface von Steuerung, kein neuer Kontext — Rendering/Routing in `src/steuerung/`, kein generischer Web-Layer (YAGNI bis ein zweiter Kontext eine Ansicht braucht).
- **Offener Punkt — Single-Writer.** `src/steuerung/CONTEXT.md` postuliert die Invariante „Single-Writer (nur der Agent)". Die Lese-Ansicht ist konform. Das mittelfristig gewünschte **Editieren im Browser** würde diese Invariante brechen (zweiter Writer) und braucht zu diesem Zeitpunkt einen eigenen ADR (Konfliktauflösung Agent vs. Mensch).
