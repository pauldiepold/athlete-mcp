# Steuerung

Der vom Athleten (über den Agenten) **selbst geschriebene** Steuerungs-Store für die Wettkampfvorbereitung: ein strategischer Gesamtplan plus Wocheneinträge. Anders als Final Surge und Garmin ist dies **kein** Read-Connector zu einer externen API, sondern das erste **eigene Write-Modell** des Workers — eine sichere, surface-unabhängige Persistenz für den Agenten (Single-Writer).

## Language

**Steuerungsplan**:
Der selbst-geschriebene strategische Gesamtplan (Block/Periodisierung, Form-Snapshot, Änderungslog). Single Source of Truth der Vorbereitung, vom Agenten als Ganzes geschrieben.
_Avoid_: Trainingsplan (im Repo für die Final-Surge-Coach-Vorgaben reserviert), Makroplan

**Woche**:
Ein Eintrag pro Kalenderwoche (Soll/Ist, Notizen) im Steuerungs-Store, adressiert über `kw` im ISO-Format `YYYY-Www` (z. B. `2026-W25`, sortierbar).
_Avoid_: Wochenlog (bezeichnet allenfalls die Gesamtmenge), Eintrag
