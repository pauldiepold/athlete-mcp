# Context Map – athlete-mcp

Ein selbst-gehosteter MCP-Server (ein Cloudflare-Worker, eine MCP-URL), der **pro Nutzer** Trainingsdaten aus mehreren externen Quellen bereitstellt, damit Claude sie live lesen kann — auch vom Handy. Ein Endpunkt, fachlich aber in getrennte Kontexte zerlegt.

Ausgelegt für mehrere Nutzer (Paul + Freunde). Provisioning ist manuell: pro Nutzer werden Credentials/Tokens lokal erzeugt und ins KV gelegt — kein Self-Service. Siehe [ADR-0001](./docs/adr/0001-athlete-mcp-ein-worker-mehrere-kontexte.md).

## Kontexte

- [Final Surge](./src/finalsurge/CONTEXT.md) — der vom Coach vorgegebene **Trainingsplan** (die Plan-Seite)
- [Garmin](./src/garmin/CONTEXT.md) — die täglichen **Körperdaten** (Physiologie/Recovery)

## Beziehungen

- **Kein gemeinsames Schreibmodell.** Beide Kontexte sind reine, voneinander unabhängige Read-Connectoren zu je einer externen, inoffiziellen App-API. Sie teilen nur die generische Server-Shell (`McpAgent`, KV-gestützter Auth-Cache) und die Mandanten-Identität.
- **Mandanten-Identität (geteilt):** Ein Pfad-Secret in der URL (`/{secret}/mcp`) identifiziert den Nutzer; das Mapping `pathsecret → userId` und alle Per-Nutzer-Credentials/Tokens liegen im KV. Siehe [ADR-0001](./docs/adr/0001-athlete-mcp-ein-worker-mehrere-kontexte.md).
- **Drei Datentypen, scharf getrennt:** Final Surge liefert ausschließlich den *Plan* (Workout), Garmin ausschließlich die *Körperdaten*. Der *absolvierte Lauf* (Ist) gehört keinem von beiden — er kommt über den Strava-Connector. Die Plan-vs-Ist-Trennung ist in [src/finalsurge/docs/adr/0001](./src/finalsurge/docs/adr/0001-nur-plan-keine-ist-daten.md) festgehalten.
