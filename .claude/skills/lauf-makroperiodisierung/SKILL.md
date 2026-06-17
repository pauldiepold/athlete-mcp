---
name: lauf-makroperiodisierung
description: Strategische Langzeit-Periodisierung fürs Lauftraining eines Athleten Richtung Zielrennen. Nutze diesen Skill, wenn der Athlet aufs große Bild schaut – z. B. "Bin ich auf Kurs für mein Ziel?", "Wie sollte mein Block bis zum Rennen aussehen?", "Was muss nach dem Zwischenrennen passieren?", Fragen zur Periodisierung, zu Trainingsphasen, zum Formtrend über Wochen/Monate, oder zur Frage, wie sich ein Coach-/Team-Plan zum eigenen Renn-Ziel verhält. Auch auslösen bei einem monatlichen/periodischen Strategie-Check oder beim Nachdenken über den Gesamtbogen der Saison. Für die konkrete laufende Woche und Tagessteuerung stattdessen den Skill lauf-wochensteuerung verwenden.
---

# Lauf-Makroperiodisierung

Der strategische Bogen bis zum Zielrennen. Während die Wochensteuerung die nächste Einheit bewertet, beantwortet dieser Skill: Ist der Athlet auf Kurs, und wie muss sich der Plan über die nächsten Monate entwickeln?

## Grundprinzip & Arbeitsteilung

- **Skill = Verfahren, Store = Fakten.** Ziel, Form, Block, Phase, strategische Entscheidungen, Baseline und Konfig stehen **ausschließlich im Steuerungs-Store**, nie im Skill hartkodiert.
- **Dieser Skill ist der eigentliche Editor des Steuerungsplans.** Hier wird die **Struktur** gebaut und umgebaut: Block, Phasengrenzen, strategische Entscheidungen, Form-Neukalibrierung über den Saisonbogen. (Die Wochensteuerung zieht zwischendurch nur Snapshot-*Zahlen* nach; das Erst-Onboarding bei leerem Store läuft ebenfalls über sie.) Seltener aufgerufen als die Wochensteuerung, dafür tiefer.
- Tools sind teils deferred → zuerst per `tool_search` laden.

## Datenquellen

**Kanonische Quelle = `get_steuerungsplan()`.** Immer zuerst lesen — Konfig (Coach/Ziel), Form-Snapshot (Fitness-Kennzahl, jüngste Schlüsselrennen, Stand-Datum), Erholungs-Baseline, strategische Entscheidungen, kompletter Block. **Er ist die Wahrheit, nicht das Skill-Memory.** Begleitend `list_wochen()` + `get_woche(kw)` für den Verlauf.

Für die Makro-Sicht längere Aktivitäts-Historie ziehen (`list_activities` über Wochen/Monate; Schlüsseleinheiten via `get_activity_performance`/`get_activity_streams`). ⚠️ Aktivitäts-Connectoren liefern Titel + Metriken, **nicht** die private Notiz — Subjektives steht in den Wochen-Keys oder kommt vom Athleten. ⚠️ Ein Coach-Plan kann Einträge **anderer Athleten** enthalten → geplantes ≠ vom Athleten gelaufenes Rennen, bestätigen.

Pace immer in **min/km** (`M:SS/km`), nie m/s oder km/h; aus m/s: `60 / (m_pro_s × 3,6)`. Distanz in km, Höhe in m.

## Plan pflegen (Whole-Object)

Schreiben über `set_steuerungsplan(content)` — **immer den ganzen Plan neu bauen**, nichts verlieren (kein Append/Marker/Prepend). Bei einem neueren aussagekräftigen Rennen/Workout den **Form-Snapshot aktualisieren** statt veraltete Zahlen fortzuschreiben, plus **Änderungslog-Zeile mit Datum**. Strukturelle Umbauten (Block, Phasen, Strategie) gehören hierher, nicht in die Wochensteuerung.

## Phasenmodell (Orientierung, nicht Dogma)

Grobes Raster einer Marathon-/Langstrecken-Saison:
- **Basisphase:** aerobe Robustheit und Volumen, entspannt.
- **Spezifischer Block (rennnah):** marathonspezifische Arbeit — hier entscheidet sich die Zielzeit.
- **Taper:** Last abbauen, Schärfe halten.

**Immer den tatsächlichen Block im Steuerungsplan und den realen Coach-Plan lesen** und daran prüfen, nicht das Modell über die Realität legen. Die konkreten Phasengrenzen stehen im Steuerungsplan.

## Die zentrale strategische Frage (falls Coach-Divergenz)

Wenn der Athlet einem Coach-/Team-Rahmen folgt, dessen Peak auf ein **anderes Rennen** zielt als sein eigenes A-Rennen:

> Trägt der hintere Teil des Coach-Plans das eigene Renn-Ziel – oder fährt er nach dem Team-Rennen runter, während der Athlet gerade seinen härtesten Block bräuchte?

Zwei Szenarien (aus der Realität ablesen, nicht raten):
1. **Coach baut für die Ziel-Läufer einen eigenen, passenden Block** → Aufgabe ist Feinjustage gegen die Zielzeit.
2. **Coach bleibt beim Team-Peak** → das Fenster zwischen Team-Rennen und A-Rennen ist der **eigene marathonspezifische Block** des Athleten; der Skill hilft, ihn kohärent zu gestalten.

Den Stand spiegeln. (Bei Selbststeuerung entfällt die Frage — der ganze Block ist selbst gestaltet.)

## Was die Zielzeit braucht (Fortschritt tracken)

Konkrete Zielbausteine (Anker-Paces, Schlüsseleinheiten) stehen im Steuerungsplan. Generische Marathon-Logik zum Prüfen:
- **Lange MP-Läufe** mit wachsendem Anteil Zieltempo – das MP-Tempo muss sich „leicht" anfühlen.
- **Schwellenarbeit** Richtung Ziel-Schwellenpace (treibt die Halbmarathon-Form).
- **Etwas VO2max/Speed** als Decke.

Beim Makro-Check: Tauchen diese Bausteine im Block auf, in **steigender Spezifität**? Wenn nicht, ist das der wichtigste Hebel – nicht mehr Umfang.

## Körperdaten-Baseline-Drift (chronischer Trend)

Dieser Skill liest den **chronischen Trend** über Wochen/Monate (`get_koerperdaten_range` über längere Zeiträume), nicht die akute Tagesform.
- **HRV-Baseline-Drift:** Wandert das HRV-Wochenmittel über die Wochen nach oben (Adaptation) oder schleichend nach unten (Eingraben)? Beim Volumen-Sprung in den Block das zentrale Frühwarnsystem.
- **Chronischer RHR-Trend:** Bleibt der Ruhepuls bei steigendem Umfang stabil auf Baseline oder driftet er dauerhaft nach oben?

Relative Bewegungen gegen die Baseline lesen, nicht absolute Scores. **Training Readiness** als nachrangigen Korroborations-Indikator behandeln (deckt sich in der Praxis oft, aber bei Widerspruch schlagen Roh-Marker + Kontext den Aggregat) — fürs Makro zählt ohnehin der Roh-Trend, nicht der Tages-Score. Kippt die Baseline-Drift, ist nicht mehr Umfang die Antwort, sondern Erholung (Schlaf/Stress).

## Haltung

Strategisch und ehrlich. Form-Hochrechnungen eher vorsichtig nach unten kalibrieren: Äquivalenztabellen überschätzen den Marathon systematisch gegenüber kürzeren Distanzen. Halbmarathon-/Kurzstreckenform ist **notwendig, aber nicht hinreichend** – die letzten 10 km im Marathon entscheidet die marathonspezifische Ausdauer, nicht das 10k-Tempo. Das klar sagen, nicht weichspülen. Athleten-spezifische Kalibrierungshinweise (wie stark jemand auf Training respondiert) stehen im Steuerungsplan.

## Output

Sprache wie der Athlet (hier Deutsch), ausführlich, Tabellen okay. Pace in min/km.
