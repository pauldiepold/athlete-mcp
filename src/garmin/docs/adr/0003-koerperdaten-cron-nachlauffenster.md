# Der Cron heilt sich selbst: Nachlauffenster statt „nur gestern"

Der tägliche Cron holt nicht mehr allein den Vortag, sondern prüft ein **Nachlauffenster von 14 Tagen** und holt darin jeden Tag nach, für den keine Archivzeile existiert. Ein **leerer** Tag — eine Zeile ohne jeden Messwert — wird zusätzlich noch **3 Tage** lang erneut angefragt und danach geglaubt. Getrennt davon lernt der Client, dass Garmins **204 No Content** kein Fehler ist, sondern die Antwort „für diesen Tag gibt es nichts".

Auslöser: Ein Blick auf das Archiv zeigte über 90 Tage 19 bis 42 fehlende Tage pro Athlet — bei laufendem, korrekt registriertem Cron. Zwei unabhängige Ursachen, die sich zum selben Bild addierten.

## Die zwei Ursachen

- **Ein gescheiterter Morgen war endgültig.** Der Cron holte ausschließlich `gestern`. Scheiterte der Abruf, war der Tag verloren: Die Read-through-Orchestrierung füllt Lücken nur in Bereichen, die jemand *aktiv abfragt*, und niemand fragt rückwirkend einen einzelnen Dienstag ab. In den Workers-Logs standen genau solche Fehler.
- **Ein leerer HRV-Block riss den ganzen Tag mit.** `getKoerperdaten` holt fünf Endpoints per `Promise.all`. Liegt für einen Tag kein HRV-Status vor, antwortet Garmin mit **204 No Content** — `res.ok` gilt, aber `res.json()` wirft auf dem leeren Body. Vier vollständige Antworten desselben Tages gingen mit unter. Verifiziert am 08.05.2026: HRV 204, Schlaf 1726 Bytes, Stress 25520, Body Battery 1262, Training Readiness 4076.

## Considered Options

- **Alarmierung statt Selbstheilung** (Fehler pushen, damit jemand den Backfill startet) — verworfen: verschiebt Arbeit auf einen Menschen für ein Problem, das die Maschine selbst lösen kann. Ein Nachlauffenster kostet im Normalbetrieb **keinen einzigen zusätzlichen Abruf**, weil ein vorhandener Tag nicht geholt wird. Die Bilanzzeile im Log bleibt trotzdem — nicht als Alarm, sondern damit ein dauerhaft klemmender Nutzer von einem gesunden unterscheidbar ist.
- **`getKoerperdatenRange` im Cron wiederverwenden** — verworfen, obwohl es Lücken füllt: Es kennt nur „Zeile vorhanden oder nicht" und würde einen leeren Tag nie erneut anfragen. Genau das braucht der Cron aber, weil eine spät synchronisierte Uhr einen leeren Tag hinterlässt, den der Cron am Morgen darauf noch nicht kannte. Die Entscheidung *welche Tage* liegt deshalb in einem eigenen reinen Modul (`koerperdatenNachlauf`), das eine andere Frage beantwortet als die Read-through-Orchestrierung: die eine bedient einen Leser, die andere pflegt das Archiv.
- **`Promise.allSettled` statt `Promise.all`** (ein gescheiterter Endpoint lässt die übrigen vier durch) — verworfen: Es macht „wir konnten nicht nachsehen" ununterscheidbar von „da war nichts". Ein 429 auf dem HRV-Endpoint würde als `hrv: null` archiviert und wäre danach eine Lücke, die niemandem mehr auffällt — ein vollständiger Tag ist nur vollständig, wenn alle fünf Antworten vorliegen. Nur der **leere** Fall (204/leerer Body) ist ein Messergebnis und darf durch. Ein HTTP-Fehler lässt den Tag weiterhin scheitern; der Cron holt ihn morgen wieder.
- **Das Fenster immer weiter aufziehen** (30, 90 Tage) — verworfen: Nach dem Onboarding eines Nutzers zieht ein großes Fenster in einem einzigen Lauf hunderte Abrufe gegen eine inoffizielle, ratelimitete API (vgl. [ADR-0001](./0001-koerperdaten-live-api-archive-first.md)). 14 Tage decken jede übliche Störung ab; für alles darüber gibt es den bewussten Lauf `scripts/backfill-koerperdaten.ts --luecken`.
- **Leere Tage unbegrenzt erneut anfragen** — verworfen: Eine uhrfreie Urlaubswoche würde dann bei jedem Lauf aufs Neue abgefragt. Nach 3 Tagen ist ein leerer Tag als echt akzeptiert.

## Consequences

- **Ein leerer Tag ist jetzt eine Zeile, keine Lücke.** Wo Garmin nichts hat, steht künftig eine Zeile mit lauter `null`-Blöcken statt gar nichts. Für die Verlaufsfläche ändert sich nichts — die *Körperdaten-Serie* liest ohnehin auf der dichten Kalender-Achse und macht aus beidem eine Lücke. Für den Cron ist der Unterschied wesentlich: die Zeile sagt „nachgesehen, nichts da" und beendet das Nachfragen.
- **Der Backfill füllt jetzt auch Kalenderlücken.** Was [ADR-0002](./0002-koerperdaten-intraday-ereignisbasiert.md) noch der Read-through-Orchestrierung allein zuschrieb, ist im CLI unter `--luecken` verfügbar (opt-in, mit Pflichtgrenzen). Der Grund ist derselbe wie hier: Read-through repariert nur, wonach jemand fragt.
- **Der Cron kann länger laufen.** Statt einem Abruf pro Nutzer sind es im Störfall bis zu 14 — sequentiell, wie ADR-0001 es verlangt. Bei vier Nutzern im schlimmsten Fall 280 Requests in einem Lauf; das liegt innerhalb der Cron-Laufzeit eines Workers, ist aber der Grund, warum das Fenster nicht größer ist.
- **Fehler eines Tages bleiben lokal.** Ein gescheiterter Tag blockiert die übrigen Tage desselben Nutzers nicht mehr, ein gescheiterter Nutzer nicht die übrigen Nutzer.
