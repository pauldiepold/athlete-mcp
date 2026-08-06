# Steuerung

Der vom Athleten (über den Agenten) **selbst geschriebene** Steuerungs-Store für die Wettkampfvorbereitung: ein strategischer Gesamtplan plus Wocheneinträge. Anders als Final Surge und Garmin ist dies **kein** Read-Connector zu einer externen API, sondern das erste **eigene Write-Modell** des Workers — eine sichere, surface-unabhängige Markdown-Persistenz. Ursprünglich Single-Writer (nur der Agent); mit dem Browser-Editing schreiben jetzt **Agent und Mensch** dasselbe Objekt — bewusst Last-Write-Wins, kein Clobber-Schutz (siehe [ADR-0004](../../docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md)).

## Language

**Steuerungsplan**:
Der selbst-geschriebene strategische Gesamtplan (Block/Periodisierung, Form-Snapshot, Änderungslog). Single Source of Truth der Vorbereitung, vom Agenten als Ganzes geschrieben.
_Avoid_: Trainingsplan (im Repo für die Final-Surge-Coach-Vorgaben reserviert), Makroplan

**Woche**:
Ein Eintrag pro Kalenderwoche (Soll/Ist, Notizen) im Steuerungs-Store, adressiert über `kw` im ISO-Format `YYYY-Www` (z. B. `2026-W25`, sortierbar).
_Avoid_: Wochenlog (bezeichnet allenfalls die Gesamtmenge), Eintrag

**Verfahren**:
Die Arbeitsweise, nach der Claude mit den Daten dieses Athleten arbeitet — *Wochensteuerung* und *Makroperiodisierung* liegen als Markdown unter `verfahren/` und gehen über den Connector als Tool-Antwort raus, nicht als installierter Skill ([ADR-0008](../../docs/adr/0008-verfahren-ueber-den-connector-statt-installierter-skills.md)). Sie liegen **hier**, weil sie den Steuerungs-Store bedienen: Sie enthalten nur Arbeitsweise, die Athleten-Fakten stehen im Steuerungsplan und in den Wochen. Ein leerer Steuerungsplan ist für sie das Signal „noch nicht onboarded" — dann verweisen sie aufs Onboarding, statt selbst zu interviewen.
_Avoid_: Skill, Prompt, Anleitung (das ist die Fläche für den Menschen)
