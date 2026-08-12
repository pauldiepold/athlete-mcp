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

**Nachlauffenster**:
Die letzten 14 Tage, die der tägliche Cron bei jedem Lauf auf fehlende Archivzeilen prüft und nachholt — der Mechanismus, der die Historie lückenlos hält, ohne dass jemand eingreifen muss. Kostet im Normalbetrieb nichts, weil ein vorhandener Tag nicht abgerufen wird. Ausdrücklich **begrenzt**: was länger zurückliegt, ist Sache eines bewussten Backfill-Laufs, nicht eines immer größeren Fensters. Siehe [ADR-0003](./docs/adr/0003-koerperdaten-cron-nachlauffenster.md).
_Vermeide_: Retry, Backfill (der ist der manuelle, unbegrenzte Lauf)

**Erstbefüllung**:
Die letzten 30 Tage Körperdaten, die direkt nach dem Herstellen der Garmin-Verbindung **im Hintergrund** geholt werden (`waitUntil`), damit das Dashboard nicht bis zum nächsten Cron-Lauf um 5 Uhr leer bleibt. Sie füllt den Bereich, den ein neues Konto noch gar nicht hat — anders als das *Nachlauffenster* frischt sie nichts auf: **ein Tag mit Archivzeile wird nie erneut abgerufen**, auch heute nicht. Weil ein Hintergrundlauf keine Zustellgarantie hat, ist sie vom Athleten **wiederholbar** und hinterlässt einen beobachtbaren Zustand (`user:<id>:garmin:erstbefuellung`: `laeuft` / `fertig` / `gescheitert`) — ohne den wäre „lädt gerade" von „verbunden, aber leer" nicht zu unterscheiden, und ein zweiter Lauf liefe in ein ratelimitetes Garmin. Ein *laufender* Zustand sperrt den nächsten und läuft nach 15 Minuten von selbst ab, damit ein verschwundener Lauf das Konto nicht dauerhaft blockiert. Sequentiell mit Pause wie jeder Garmin-Lauf.
_Vermeide_: Backfill (das ist das lokale CLI), Nachlauf, Import, Sync

**Hol-Lauf**:
Eine Liste von Tagen für einen Athleten bei Garmin holen und ins Archiv schreiben — das Stück, das *Nachlauffenster* und *Erstbefüllung* gemeinsam haben und das seit Issue #55 an genau einer Stelle steht (`koerperdatenHolLauf`). Dazu gehört: sequentiell durchgehen, gescheiterte Tage sammeln statt abbrechen, den Fehler-Marker **asymmetrisch** setzen und eine Bilanzzeile loggen. Ausdrücklich **nicht** dazu gehört, *welche* Tage geholt werden — das ist der fachliche Kern der beiden Läufe und bleibt bei ihnen. Ein Lauf, dessen Client gar nicht erst entsteht, **wirft**: Das ist kein gescheiterter Tag, sondern ein Lauf, der nicht stattfindet, und die beiden Aufrufer hinterlassen dafür verschiedene Spuren (Cron-Bilanz gegen KV-Zustand). Das lokale *Backfill*-CLI bleibt außen vor — ihm sieht ein Mensch zu, deshalb ist Rechenschaft dort eine Fortschrittszeile pro Tag statt eines Markers.
_Vermeide_: Sync, Job, Batch

**Leerer Tag**:
Eine Archivzeile, deren sämtliche Blöcke `null` sind — Garmin wurde gefragt und hatte für diesen Tag nichts (keine Uhr getragen). Zu unterscheiden von der **fehlenden** Zeile, bei der niemand nachgesehen hat: die eine beendet das Nachfragen, die andere löst es aus. Weil eine spät synchronisierte Uhr denselben Zustand erzeugt, wird ein leerer Tag noch 3 Tage lang erneut angefragt und danach geglaubt.
_Vermeide_: Lücke (für die leere Zeile), fehlender Tag

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

**SSO-Widget-Flow**:
Der eine Weg, auf dem sich dieses System bei Garmin anmeldet: `/sso/embed` → `/sso/signin` mit CSRF-Token → Service-Ticket → Tausch bei `diauth.garmin.com`. **Nicht** der OAuth1-Pfad aus älteren Notizen und nicht der Mobile- oder Portal-Pfad — Spike #38 hat alle fünf Strategien einzeln vermessen: Mobile läuft dauerhaft in ein clientId-Rate-Limit (429), Portal in Cloudflare (403/CAPTCHA). Nur der Widget-Flow trägt, und zwar ohne TLS-Impersonation (27/27 Läufe, im Mittel 3,75 s). Der Ticket-Tausch ist ein Form-POST; Consumer-Key und Signierung entfallen vollständig. Ausdrücklich **inoffiziell und brechbar** — deshalb liegt der Teil, der bricht (das Lesen der HTML-Antworten), als reine Funktionen unter Test.
_Vermeide_: Garmin-OAuth, Garmin-Login-API

**DI-Bündel**:
`di_token`, `di_refresh_token` und `di_client_id` — das Einzige, was von einer Garmin-Anmeldung gespeichert wird (`user:<id>:garmin`). Die **Zugangsdaten werden nie abgelegt**, auch nicht verschlüsselt und auch nicht für die Dauer einer offenen MFA-Abfrage: Sie werden einmal durchgereicht, danach erneuert der Refresh-Token. Der `display_name` liegt daneben (`…:garmin:profile`) und nicht mit im Bündel, weil der Refresh es komplett neu schreibt.
_Vermeide_: Garmin-Credentials, Token (ohne Angabe, welches)

**MFA-Zwischenzustand**:
Cookies, das **frische** `_csrf` der MFA-Seite und der Referer einer offenen Zwei-Faktor-Abfrage — rund 1 kB JSON, das zwischen zwei HTTP-Requests des Athleten unter einem opaken Handle im KV liegt (`garmin:mfa:<handle>`, 10 Minuten, beim Einlösen gelöscht, an das Konto gebunden). Er existiert, weil der Worker keinen Prozess hat, der überlebt, während jemand in seine Authenticator-App schaut. Das CSRF-Token ist ein anderes als das der Signin-Seite; nähme der zweite Schritt das alte, sähe der Fehlschlag nach „falscher Code" aus.
_Vermeide_: MFA-Session, Login-State
