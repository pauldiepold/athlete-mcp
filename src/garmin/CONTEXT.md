# Garmin

Stellt Pauls (und perspektivisch der Freunde) tägliche **Körperdaten** aus Garmin Connect bereit, damit Claude den physiologischen Zustand neben dem Trainingsplan lesen kann. Angebunden über die inoffizielle Connect-App-API; archive-first in D1 (siehe [ADR-0001](./docs/adr/0001-koerperdaten-live-api-archive-first.md)).

## Sprache

**Körperdaten**:
Die täglichen physiologischen Messwerte eines Nutzers aus Garmin (HRV-Status, Schlaf, Stress/Body Battery, Training Readiness, Hauttemperatur). Der dritte Datentyp neben dem geplanten *Workout* (Final Surge) und dem *absolvierten Lauf* (Strava) — und keiner von beiden.
_Vermeide_: Wellness, Gesundheitsdaten, Vitaldaten, Metriken

**Tagesform**:
Die *interpretierte* Lesart der Körperdaten — die abgeleitete Einschätzung „wie erholt/belastbar bin ich heute", die im Chat aus Plan, Kontext und Körperdaten entsteht. Weiterhin **nicht implementiert**; hier benannt, damit die Ebene einen festen Namen hat. Ausdrücklich **nicht** der *Körperdaten-Index*: der ist gerechnet, die Tagesform ist gedeutet, und der Index ist ihr Rohmaterial, keine Vorwegnahme. Siehe [ADR-0006](../../docs/adr/0006-koerperdaten-index-gerechnete-zahl-neben-der-tagesform.md).
_Vermeide_: Readiness (für die abgeleitete Gesamteinschätzung), Recovery-Score, Körperdaten-Index (für die Deutung)

**Körperdaten-Index**:
Eine mechanisch aus vier Markern gerechnete Zahl von 0 bis 100 (HRV 35 %, Schlaf 25 %, Ruhepuls 20 %, Bereitschaft 20 %) — der schnelle Gesamteindruck auf der Verlaufsfläche. **Gerechnet, nicht gedeutet**: zu jedem Index gehört die Aufschlüsselung, aus welchen Punkten und Gewichten er entstanden ist, und die Oberfläche zeigt ihn als Rechnung, nie als Urteil. Fehlt ein Marker, tragen die übrigen seinen Anteil renormalisiert mit; fehlen mehr als zwei, gibt es keinen Index — eine Lücke statt einer Schätzung. Die Kalibrierung ist eine Setzung und liegt an genau einer Stelle (`koerperdatenIndex.KALIBRIERUNG`). Nicht die *Tagesform*, siehe [ADR-0006](../../docs/adr/0006-koerperdaten-index-gerechnete-zahl-neben-der-tagesform.md).
_Vermeide_: Tagesform, Readiness-Score, Score (ohne Angabe, welcher gemeint ist)

**Beitrag (einer Achse)**:
Was ein einzelner Marker zum Körperdaten-Index eines Tages beisteuert: seine Punkte (0–100), sein an diesem Tag geltendes Gewicht und beides multipliziert. Die vier Beiträge summieren sich zum Index — die Aufschlüsselung ist Teil des Modul-Vertrags, damit an der Oberfläche steht, welcher Marker heute nach unten zieht.

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

**Wochen-Key**:
Der Schlüssel `YYYY-Www`, unter dem die [Steuerung](../steuerung/CONTEXT.md) ihre *Wochen* ablegt und den sie streng validiert. `isoWoche` rechnet einen Körperdaten-Tag darauf um — die einzige Stelle, an der ein Tag seine Woche erfährt. Das Jahr darin ist das **Wochen-Jahr**, nicht zwingend das Kalenderjahr des Tages: nach ISO 8601 entscheidet der Donnerstag der Woche, weshalb ein 1. Januar oft noch in die letzte Woche des Vorjahres fällt. Ein falsch gerechneter Schlüssel wirft nicht, er verbände den Tag still mit dem falschen Wocheneintrag.
_Vermeide_: Kalenderwoche (mehrdeutig zwischen Nummer und Schlüssel), KW-Nummer

**Body-Battery-Bilanz**:
Geladen minus verbraucht über einen Tag. Positiv an einem Ladetag, negativ an einem Zehrtag. Fehlt eine der beiden Seiten, ist die Bilanz eine Lücke — eine fehlende Seite als Null zu rechnen würde einen Tag erfinden.
