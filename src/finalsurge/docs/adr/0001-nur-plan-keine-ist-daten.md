# Nur die Plan-Seite liefern, Ist-Daten verwerfen

Final Surges `WorkoutList` liefert pro Eintrag sowohl die geplante Coach-Vorgabe als auch die absolvierten Mess-Daten (`Activities[].Laps`, HR, Pace, Power, GPS, Wetter, Sync-Felder). Dieser Server gibt bewusst **nur die Plan-Seite** zurück (`name`, `description`, `activity_type_name`, `activity_sub_type_name`, `is_race`) und strippt alle Ist-Daten weg.

**Warum:** Die absolvierten Läufe besitzt der Strava-Connector. Würde dieser Server Plan und Ist mischen, gäbe es zwei Quellen für dasselbe „Ist" und Claude müsste sie deduplizieren. Die scharfe Trennung — Final Surge = Plan, Strava = Ist — hält die Verantwortung jedes Connectors eindeutig.

**Konsequenz / nicht-offensichtlich:** Ein künftiger Leser sieht in der API-Antwort reiche Ist-Daten und könnte versucht sein, sie „auch noch" durchzureichen. Das ist eine absichtliche Auslassung, kein Versehen. Strukturierte *Plan*-Felder (`planned_*`) existieren ohnehin nicht befüllt (siehe Issue #1); die Vorgabe steckt vollständig im Freitext aus `name` + `description`.
