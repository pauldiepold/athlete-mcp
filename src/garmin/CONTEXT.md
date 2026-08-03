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
