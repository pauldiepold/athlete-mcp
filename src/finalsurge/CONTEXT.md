# Final Surge MCP

Ein selbst-gehosteter MCP-Server, der Pauls vom Coach vorgegebenen Trainingsplan aus Final Surge bereitstellt, damit Claude ihn live lesen kann — auch vom Handy.

## Sprache

**Final Surge**:
Die externe Trainingsplattform, in der Pauls Coach die geplanten Workouts pflegt. Die einzige Quelle des *geplanten* Trainings; angebunden über ihre inoffizielle App-API.
_Vermeide_: FS, fs

**Coach**:
Der BTC-Coach, der den Trainingsplan in Final Surge schreibt. Autor des Vorgabetexts eines Workouts.

**Workout**:
Eine einzelne geplante Trainings-Vorgabe des Coaches für einen Tag (Datum + Vorgabetext + geplante Aktivitäten). Dieser Server liefert ausschließlich die *geplante* Seite — niemals den absolvierten Lauf.
_Vermeide_: Training, Einheit (für die Vorgabe)

**Absolvierter Lauf**:
Das tatsächlich gelaufene Ergebnis. Liegt außerhalb dieses Servers — kommt über den Strava-Connector. Dieser Server vermischt Plan und Ist bewusst nicht.

**Ruhetag**:
Ein Workout, dessen Aktivität den `activity_type_name` „Ruhetag" trägt (Account-Sprache Deutsch). Markiert einen geplanten Ruhetag — kein Lauf.
_Vermeide_: Rest Day

**Fokus**:
Die Trainingszone/-art eines Workouts, aus `activity_sub_type_name` (z. B. „VO2 Max", „Subthreshold", „Regenerations-Lauf", „Test-Race"). Die semantische Einordnung der Vorgabe.

**Wettkampf**:
Ein Renn-/Event-Termin im Plan. Erscheint in der API als Workout mit `activity_type_name` „Anderes" und Fokus „Termin" (z. B. „BBM 3.000m", „Más 5k Invitational"). Gehört zum Plan und wird **nicht** herausgefiltert, obwohl es kein Lauf-Workout ist.
_Vermeide_: Termin (außerhalb des API-Feldnamens)
