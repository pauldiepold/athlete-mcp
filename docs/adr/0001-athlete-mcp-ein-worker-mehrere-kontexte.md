# athlete-mcp: ein Worker, mehrere Kontexte, mandantenfähig

Aus dem Single-Purpose-Server `finalsurge-mcp` wird **athlete-mcp**: ein Cloudflare-Worker mit *einer* MCP-URL, der mehrere unabhängige Read-Connectoren (heute Final Surge = Plan, Garmin = Körperdaten) als getrennte Bounded Contexts bündelt (`CONTEXT-MAP.md` + `src/<context>/`). Wir haben das einer zweiten, separaten MCP-URL vorgezogen, weil der Nutzer genau *einen* Endpunkt in seinen Chats haben will und die Server-Shell (`McpAgent`, KV-Auth-Cache, Pfad-Secret) ohnehin generisch ist.

## Considered Options

- **Zwei getrennte MCP-Server/Worker** — verworfen: zwei URLs, zwei Deployments, zwei Secret-Sets in jedem Chat; widerspricht dem „ein MCP"-Wunsch.
- **Alles in einem flachen Kontext vermischen** — verworfen: Final Surge (Plan) und Garmin (Körperdaten) haben andere Quelle, Auth und Verantwortung; die scharfe Trennung hält jeden Connector eindeutig.

## Consequences

- **Mandantenfähig, aber manuell provisioniert.** Ein Pfad-Secret in der URL (`/{secret}/mcp`) identifiziert den Nutzer; `pathsecret → userId` und alle Per-Nutzer-Credentials/Tokens liegen im KV (`user:<id>:<context>`). Kein Self-Service-Onboarding — Paul legt die KV-Einträge pro Freund von Hand an (lokaler Login, dann `wrangler kv key put`).
- **Credentials liegen im Klartext im KV.** Bewusst keine App-Layer-Verschlüsselung (kein `MASTER_KEY`), da nur Paul Account-Zugriff hat. Bei mehr Betreibern neu zu bewerten.
- **Asymmetrisches Auth-Artefakt je Connector.** Final Surge re-loggt sich im Worker → Passwort muss im KV liegen. Garmin nutzt einen Refresh-Token → kein Passwort im Backend. Siehe [Garmin-ADR-0001](../../src/garmin/docs/adr/0001-koerperdaten-live-api-archive-first.md).
- **Rename mit Folgen:** Repo, `McpServer`-Name und globale Env-Secrets ziehen mit. Die bestehende Plan-vs-Ist-Entscheidung bleibt auf den Final-Surge-Kontext beschränkt ([src/finalsurge/docs/adr/0001](../../src/finalsurge/docs/adr/0001-nur-plan-keine-ist-daten.md)).
