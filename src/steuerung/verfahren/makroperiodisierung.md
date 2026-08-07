# Verfahren: Makroperiodisierung

Der strategische Bogen bis zum Zielrennen. Während die Wochensteuerung die nächste Einheit bewertet, beantwortet dieses Verfahren: Ist der Athlet auf Kurs, und wie muss sich der Plan über die nächsten Monate entwickeln?

## Grundprinzip

- **Verfahren = Arbeitsweise, Store = Fakten.** Ziel, Form, Block, Phase, strategische Entscheidungen, Baseline und Konfig stehen **ausschließlich im Steuerungs-Store**, nie in diesem Text.
- **Dies ist der Editor des Steuerungsplans.** Hier wird die **Struktur** gebaut und umgebaut: Block, Phasengrenzen, strategische Entscheidungen, Form-Neukalibrierung über den Saisonbogen. Die Wochensteuerung (`get_playbook_week`) zieht zwischendurch nur Snapshot-*Zahlen* nach. Seltener aufgerufen, dafür tiefer.
- **Whole-Object.** `set_training_profile(content)` schreibt immer den ganzen Plan neu: vorher lesen, nichts verlieren, dann komplett überschreiben (kein Append, kein Marker, kein Prepend). Jede Änderung bekommt eine **Änderungslog-Zeile mit Datum**.
- **Leerer Steuerungsplan?** Dann gibt es noch keinen Bogen, den man periodisieren könnte — erst der Einstieg (`get_playbook_onboarding`).
- **Sprache am Athleten.** Der Store heißt ihm gegenüber **Trainingsbuch**, der Steuerungsplan darin **Grundlagen**, die Wochen bleiben **Wochen**. „Steuerung"/„Steuerungsplan" sind Wörter aus dem Repo und bleiben in diesem Text.

## Datenquellen

**Kanonisch ist `get_training_profile()`** — immer zuerst lesen, und er ist die Wahrheit, nicht die Erinnerung aus dem Gespräch. Er trägt Konfig (Coach/Ziel/Nebenrennen), Form-Snapshot (Fitness-Kennzahl, jüngste Schlüsselrennen, Stand-Datum, Umfang-Median), Rahmen & Verfügbarkeit, Gesundheit & Historie, Erholungs-Baseline, strategische Entscheidungen und den kompletten Block. Begleitend `list_weeks()` + `get_week(kw)` für den Verlauf.

**Rahmen und Gesundheit begrenzen den Bogen:** Ein Block, der mehr Trainingstage oder Umfang voraussetzt als dort steht, ist keine Strategie, sondern ein Wunsch — entweder den Block anpassen oder den Rahmen mit dem Athleten explizit neu verhandeln.

Für die Makro-Sicht längere Aktivitäts-Historie ziehen (`list_activities` über Wochen/Monate; Schlüsseleinheiten via `get_activity_performance`/`get_activity_streams`). ⚠️ Aktivitäts-Connectoren liefern Titel + Metriken, **nicht** die private Notiz — Subjektives steht in den Wochen-Keys oder kommt vom Athleten. ⚠️ Ein Coach-Plan kann Einträge **anderer Athleten** enthalten → geplantes ≠ gelaufenes Rennen, bestätigen lassen.

**Einheiten (hart, immer)**, in Tabellen wie in jedem Nebensatz: Pace in **min/km** (`M:SS/km`; aus m/s: `60 / (m_pro_s × 3,6)`), Distanz in km, Höhe in m. Kadenz in **Schritten pro Minute** (`spm`, beide Beine, typisch ~160–185) — Connector-Werte sind pro Bein (~80–92) und werden **mit 2 multipliziert**, bevor sie irgendwo auftauchen.

## Phasenmodell (Orientierung, nicht Dogma)

Grobes Raster einer Marathon-/Langstrecken-Saison:

- **Basisphase:** aerobe Robustheit und Volumen, entspannt.
- **Spezifischer Block (rennnah):** marathonspezifische Arbeit — hier entscheidet sich die Zielzeit.
- **Taper:** Last abbauen, Schärfe halten.

Die konkreten Phasengrenzen stehen im Steuerungsplan. **Immer am tatsächlichen Block und am realen Coach-Plan prüfen**, kein Modell über die Realität legen.

## Die zentrale strategische Frage (bei Coach-Divergenz)

Folgt der Athlet einem Coach-/Team-Rahmen, dessen Peak auf ein **anderes Rennen** zielt als sein eigenes A-Rennen:

> Trägt der hintere Teil des Coach-Plans das eigene Renn-Ziel — oder fährt er nach dem Team-Rennen runter, während der Athlet gerade seinen härtesten Block bräuchte?

Zwei Szenarien, aus der Realität abgelesen statt geraten:

1. **Coach baut für die Ziel-Läufer einen eigenen, passenden Block** → Aufgabe ist Feinjustage gegen die Zielzeit.
2. **Coach bleibt beim Team-Peak** → das Fenster zwischen Team-Rennen und A-Rennen ist der **eigene marathonspezifische Block** des Athleten; hier hilft dieses Verfahren, ihn kohärent zu gestalten.

Den Stand spiegeln. Bei Selbststeuerung entfällt die Frage — der ganze Block ist selbst gestaltet.

## Was die Zielzeit braucht (Fortschritt tracken)

Die konkreten Zielbausteine (Anker-Paces, Schlüsseleinheiten) stehen im Steuerungsplan. Generische Marathon-Logik zum Prüfen:

- **Lange MP-Läufe** mit wachsendem Anteil Zieltempo — das MP-Tempo muss sich „leicht" anfühlen.
- **Schwellenarbeit** Richtung Ziel-Schwellenpace (treibt die Halbmarathon-Form).
- **Etwas VO2max/Speed** als Decke.

Beim Makro-Check: Tauchen diese Bausteine im Block auf, in **steigender Spezifität**? Wenn nicht, ist das der wichtigste Hebel — nicht mehr Umfang.

## Körperdaten-Baseline-Drift (chronischer Trend)

Hier zählt der **chronische Trend** über Wochen und Monate (`get_body_metrics_range` über längere Zeiträume), nicht die akute Tagesform. Relative Bewegungen gegen die Baseline lesen, nicht absolute Scores.

- **HRV-Baseline-Drift:** Wandert das HRV-Wochenmittel über die Wochen nach oben (Adaptation) oder schleichend nach unten (Eingraben)? Beim Volumen-Sprung in den Block das zentrale Frühwarnsystem.
- **Chronischer RHR-Trend:** Bleibt der Ruhepuls bei steigendem Umfang stabil auf Baseline oder driftet er dauerhaft nach oben?

**Training Readiness** ist ein nachrangiger Korroborations-Indikator — bei Widerspruch schlagen Roh-Marker + Kontext den Aggregat; fürs Makro zählt ohnehin der Roh-Trend, nicht einzelne Readings. Kippt die Baseline-Drift, ist nicht mehr Umfang die Antwort, sondern Erholung (Schlaf/Stress).

## Haltung

Strategisch und ehrlich. Form-Hochrechnungen eher vorsichtig nach unten kalibrieren: Äquivalenztabellen überschätzen den Marathon systematisch gegenüber kürzeren Distanzen. Halbmarathon-/Kurzstreckenform ist **notwendig, aber nicht hinreichend** — die letzten 10 km im Marathon entscheidet die marathonspezifische Ausdauer, nicht das 10k-Tempo. Das klar sagen, nicht weichspülen. Athleten-spezifische Kalibrierungshinweise (wie stark jemand auf Training respondiert) stehen im Steuerungsplan.

## Output

Sprache wie der Athlet (hier Deutsch), ausführlich, Tabellen okay.
