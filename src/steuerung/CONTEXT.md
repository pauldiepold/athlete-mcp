# Steuerung

Der vom Athleten (über den Agenten) **selbst geschriebene** Steuerungs-Store für die Wettkampfvorbereitung: ein strategischer Gesamtplan plus Wocheneinträge. Anders als Final Surge und Garmin ist dies **kein** Read-Connector zu einer externen API, sondern das erste **eigene Write-Modell** des Workers — eine sichere, surface-unabhängige Markdown-Persistenz. Ursprünglich Single-Writer (nur der Agent); mit dem Browser-Editing schreiben jetzt **Agent und Mensch** dasselbe Objekt — bewusst Last-Write-Wins, kein Clobber-Schutz (siehe [ADR-0004](../../docs/adr/0004-eigenstaendiges-nuxt-frontend-monorepo-browser-editing.md)).

## Language

**Steuerungsplan**:
Der selbst-geschriebene strategische Gesamtplan (Block/Periodisierung, Form-Snapshot, Änderungslog). Single Source of Truth der Vorbereitung, vom Agenten als Ganzes geschrieben. Die Tools heißen `get_training_profile` / `set_training_profile` (Titel: „Grundlagen lesen/schreiben"); Store, Spalte und Sprache bleiben **Steuerungsplan**.
_Avoid_: Trainingsplan (im Repo für die Final-Surge-Coach-Vorgaben reserviert), Makroplan

**Woche**:
Ein Eintrag pro Kalenderwoche (Soll/Ist, Notizen) im Steuerungs-Store, adressiert über `kw` im ISO-Format `YYYY-Www` (z. B. `2026-W25`, sortierbar). Tools: `list_weeks`, `get_week`, `set_week`.
_Avoid_: Wochenlog (bezeichnet allenfalls die Gesamtmenge), Eintrag

**Verfahren**:
Die Arbeitsweise, nach der Claude mit den Daten dieses Athleten arbeitet — *Wochensteuerung*, *Makroperiodisierung* und *Onboarding* liegen als Markdown unter `verfahren/` und gehen über den Connector als Tool-Antwort raus, nicht als installierter Skill ([ADR-0008](../../docs/adr/0008-verfahren-ueber-den-connector-statt-installierter-skills.md)). Sie liegen **hier**, weil sie den Steuerungs-Store bedienen: Sie enthalten nur Arbeitsweise, die Athleten-Fakten stehen im Steuerungsplan und in den Wochen. Ein leerer Steuerungsplan ist für die beiden laufenden Verfahren das Signal „noch nicht onboarded" — dann verweisen sie aufs Onboarding, statt selbst zu interviewen.
Nach außen heißen sie `get_playbook_week`, `get_playbook_season` und `get_playbook_onboarding`: Tool-Namen sind englisch, weil sie Prompt-Material sind, und tragen ihr deutsches `title` („Arbeitsweise: Woche/Saison/Einstieg") für den Athleten (Issue #58). Im Repo und im Gespräch bleibt es das **Verfahren**.
_Avoid_: Skill, Prompt, Anleitung (das ist die Fläche für den Menschen), Playbook (nur der Tool-Name)

**Onboarding**:
Das einmalige Verfahren vom leeren Store zum ersten Steuerungsplan (Issue #50): Zustand über die vorhandenen Tools lesen, einmal inhaltlich interviewen (Zielrennen, Form, Phase), Starter-Plan schreiben, Steuerung und Dashboard erklären, in einen **neuen** Chat übergeben. Das Technische — Verbindungen, Zugangsdaten — bleibt in der Weboberfläche; das Verfahren fragt **nie** danach. Sein Auslöser ist eng: der `ERSTKONTAKT_SATZ` aus `erstkontakt.ts`, den die Einrichtung zum Kopieren anbietet, plus der leere Plan als objektives Merkmal.
_Avoid_: Einrichtung (das sind die vier Schritte im Browser, Issue #52 — das Onboarding ist ihr vierter), Setup-Assistent (es gibt kein Tor, durch das man erst hindurch müsste)

**Erstkontakt-Satz**:
Der eine vorgegebene Satz, mit dem der Athlet sein Onboarding auslöst. Er steht als `ERSTKONTAKT_SATZ` in `erstkontakt.ts` und nur dort: Die Einrichtung bietet ihn zum Kopieren an, die `description` von `get_playbook_onboarding` nennt ihn wörtlich als Auslöser. Driften die beiden auseinander, tippt der Athlet einen Satz, auf den nichts mehr zielt.
_Avoid_: Trigger, Startsatz, Zauberwort (er ist keine Geheimformel, sondern der Auslöser eines einzelnen, absichtlich eng gefassten Tools)
