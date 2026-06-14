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

**Training Readiness**:
Garmins eigener Tages-Score (0–100) aus Schlaf, Erholung, HRV und Belastung. Ein Körperdaten-Wert der Quelle — Rohwert, nicht unsere abgeleitete *Tagesform*.
