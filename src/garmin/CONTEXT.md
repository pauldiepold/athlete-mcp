# Garmin

Stellt Pauls (und perspektivisch der Freunde) tägliche **Körperdaten** aus Garmin Connect bereit, damit Claude den physiologischen Zustand neben dem Trainingsplan lesen kann. Angebunden über die inoffizielle Connect-App-API; archive-first in D1 (siehe [ADR-0001](./docs/adr/0001-koerperdaten-live-api-archive-first.md)).

## Sprache

**Körperdaten**:
Die täglichen physiologischen Messwerte eines Nutzers aus Garmin (HRV-Status, Schlaf, Stress/Body Battery, Training Readiness, Hauttemperatur). Der dritte Datentyp neben dem geplanten *Workout* (Final Surge) und dem *absolvierten Lauf* (Strava) — und keiner von beiden.
_Vermeide_: Wellness, Gesundheitsdaten, Vitaldaten, Metriken

**Tagesform**:
Die *interpretierte* Lesart der Körperdaten — die abgeleitete Einschätzung „wie erholt/belastbar bin ich heute", die später auf den rohen Körperdaten aufsetzt. Heute noch nicht implementiert; hier benannt, damit die Ebene einen festen Namen hat.
_Vermeide_: Readiness (für die abgeleitete Gesamteinschätzung), Recovery-Score

**HRV-Status**:
Garmins über mehrere Nächte gemittelte Herzfrequenzvariabilität samt Einordnung (z. B. „ausgeglichen"). Ein einzelner Körperdaten-Wert, nicht die Tagesform selbst.

**Körperdaten-Serie**:
Ein einzelner Körperdaten-Wert über einen Zeitraum, aufgereiht auf die **dichte Kalender-Achse** des Zeitraums — ein Wert je Tag, ein `null` je Tag ohne Messung. Die Form, in der die Verlaufs-Oberfläche Körperdaten liest (`koerperdatenSerien`). Eine Lücke bleibt eine Lücke: nie fortgeschrieben, nie interpoliert, auch nicht durch ein rollierendes Mittel.
_Vermeide_: Zeitreihe (im Repo für die dichten Intraday-Messkurven reserviert, die wir laut [ADR-0002](./docs/adr/0002-koerperdaten-intraday-ereignisbasiert.md) gar nicht archivieren)

**Training Readiness**:
Garmins eigener Score (0–100) aus Schlaf, Erholung, HRV und Belastung. **Kein Tageswert**: Garmin rechnet ihn mehrfach am Tag neu — nach dem Aufwachen, nach einer Aktivität — und jede Neuberechnung trägt ihren eigenen Zeitpunkt und Auslöser. Ein Score nach dem Abendtraining ist deshalb nicht mit einem Morgen-Score vergleichbar. Rohwert der Quelle, nicht unsere abgeleitete *Tagesform*.

**Morgenwert der Training Readiness**:
Der Score genau des Readings mit dem Auslöser `AFTER_WAKEUP_RESET` — der einzige, der sich über Tage hinweg vergleichen lässt, und damit der Wert, der in einen Verlauf gehört. Ein Tag ohne ein solches Reading (auch: ältere Readings, die gar keinen Auslöser tragen) ist eine **Lücke**; das früheste Reading des Tages ersatzweise zu nehmen, würde genau die Vermischung wiederherstellen, die [ADR-0002](./docs/adr/0002-koerperdaten-intraday-ereignisbasiert.md) beseitigt hat.
_Vermeide_: Tages-Readiness, Readiness-Score (ohne Angabe, welches Reading gemeint ist)

**Akute Last**:
Garmins `acuteLoad`, gelesen vom **spätesten** Reading eines Tages — der Tagesendstand. Anders als beim Morgenwert ist hier gerade der jüngste Stand gefragt: die Belastung des Tages ist erst am Abend vollständig.

**Body-Battery-Bilanz**:
Geladen minus verbraucht über einen Tag. Positiv an einem Ladetag, negativ an einem Zehrtag. Fehlt eine der beiden Seiten, ist die Bilanz eine Lücke — eine fehlende Seite als Null zu rechnen würde einen Tag erfinden.
