/**
 * Der „heutige Tag" der geteilten Server-Shell — eine Definition für alle Flächen.
 *
 * Garmin datiert seine Tagesblobs **lokal**, und der Coach plant in lokalen Tagen.
 * Über UTC gerechnet läge „heute" nachts um einen Tag daneben: der Cron holte den
 * falschen Vortag, und `get_upcoming_workouts` begänne abends bereits morgen.
 *
 * Lag bis ADR-0007 doppelt vor (`todayInBerlin` in der Worker-Shell, `heuteInBerlin`
 * im Web-Target). Mit einem einzigen Deployable gibt es dafür keinen Grund mehr —
 * und zwei Definitionen desselben Tages sind genau die Art Drift, die niemand
 * bemerkt, bis die Zeitumstellung sie sichtbar macht.
 */

/** Heutiges Datum in der Zeitzone des Athleten als YYYY-MM-DD (en-CA liefert ISO-Reihenfolge). */
export function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(new Date());
}
