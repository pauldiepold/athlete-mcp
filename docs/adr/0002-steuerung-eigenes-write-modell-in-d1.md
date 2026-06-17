# Steuerung: erstes eigenes Write-Modell, in der geteilten D1 (nicht KV)

Der neue Kontext **Steuerung** (selbst-geschriebener Steuerungsplan + Wocheneinträge) ist das erste **Write-Modell** des Workers und der erste Kontext, der *kein* Read-Connector zu einer externen API ist — er bricht damit bewusst die in `CONTEXT-MAP.md` notierte Invariante „kein gemeinsames Schreibmodell, nur Read-Connectoren". Persistiert wird in **D1** (Tabellen `steuerungsplan` und `steuerung_woche`, je per `user_id`), nicht in KV. Single-Writer (nur der Agent schreibt) → keine Concurrency-/Clobber-Schutzlogik nötig; ganze Objekte werden überschrieben.

## Considered Options

- **KV (wie im Handoff vorgeschlagen)** — verworfen: KV ist hier Auth-/Session-only und **eventually consistent**. Der Kern-Ablauf läuft in *einer* Chat-Session (`set_woche` → kurz darauf `list_wochen`/`get_woche`); eine gerade geschriebene Woche dürfte im KV-`list` noch nicht erscheinen. D1 ist strong consistent und macht `list_wochen` zu einem trivialen `SELECT … WHERE user_id ORDER BY kw`.
- **Eigene D1-Datenbank pro Kontext** — verworfen: zu schwer für zwei kleine Tabellen. Stattdessen die bestehende DB mitnutzen und das Binding generisch umbenennen (`KOERPERDATEN_DB` → `ATHLETE_DB`); der Cloud-DB-Name bleibt kosmetisch `athlete-mcp-koerperdaten`.

## Consequences

- Durable Nutzerinhalt liegt damit kontextübergreifend in **einer** D1; die Bounded-Context-Trennung läuft über getrennte Tabellen und `src/<context>/`, nicht über getrennte Datenbanken.
- Credentials/Tokens bleiben in KV, durable Content in D1 — klare Schichtung.
- Initiales Befüllen erfolgt über die MCP-Write-Tools selbst (Chat-Session), nicht über einen Seeding-Codepfad.
