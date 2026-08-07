import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'

/**
 * Was die Startseite einem angemeldeten Athleten zeigt (Issue #51) — als reine
 * Funktion über die drei Dinge, die der Server dazu weiß.
 *
 * Die Entscheidung hängt an **vorhandenen Körperdaten**, nicht am Verbindungszustand.
 * Zwischen beidem liegt die *Erstbefüllung*: Am Verbinden aufgehängt, zeigte die Seite
 * direkt nach dem Verbinden ein leeres Dashboard — und ein leeres Dashboard sieht aus
 * wie ein kaputtes.
 *
 * **Nur die Körperdaten-Hälfte** (Issue #57). Die *Einrichtung* stand hier eine Zeit
 * lang als erster Fall und ersetzte das Dashboard ganz; seit sie eine zweite Achse ist
 * — oberhalb des Dashboards, solange ein Pflichtschritt offen ist —, entscheidet sie
 * nichts mehr an dieser Stelle. Die Sorge dahinter (wer Verläufe sieht, hält die
 * Einrichtung für erledigt) trägt jetzt die Position und der Ton der Karte.
 *
 * Hier im Web-Target und nicht in `src/`, weil das keine Garmin-Fachlichkeit ist,
 * sondern die Politik einer Fläche: welcher Hinweis zu welchem Zustand gehört. Rein
 * und getestet bleibt sie trotzdem — die Reihenfolge der Fälle ist das Eigentliche
 * daran, und die ist in einer Vue-Template-Kette nicht prüfbar.
 */
export type StartseitenZustand
  = /** Ohne Garmin gibt es nichts zu zeigen — der Weg führt in die Einstellungen. */
  | 'nicht-verbunden'
  /** Die Erstbefüllung holt gerade; was schon da ist, wird trotzdem gezeigt. */
  | 'laeuft'
  /** Verbunden, aber leer und kein Lauf — der Athlet kann das Holen anstoßen. */
  | 'keine-daten'
  /** Der Normalfall: Verläufe. */
  | 'daten'

export interface StartseitenEingaben {
  garminVerbunden: boolean
  hatKoerperdaten: boolean
  lauf: ErstbefuellungLauf | null
}

export function startseitenZustand({
  garminVerbunden,
  hatKoerperdaten,
  lauf,
}: StartseitenEingaben): StartseitenZustand {
  // Der laufende Lauf zuerst, sogar vor vorhandenen Daten: An diesem Zustand hängt,
  // dass **kein** Nachladen-Knopf erscheint. Ein Knopf, der auftaucht, während der
  // Lauf schon läuft, provoziert den Doppelklick gegen ein rate-limitiertes Garmin.
  if (lauf?.status === 'laeuft') return 'laeuft'

  // Danach die Daten und erst dann die Verbindung: Wessen Verbindung nach Monaten
  // bricht, hat weiterhin ein Archiv. Das gegen einen Einrichtungs-Hinweis zu
  // tauschen, nähme ihm alles Vorhandene für etwas, das der Verbindungs-Hinweis
  // ohnehin über den Verläufen sagt.
  if (hatKoerperdaten) return 'daten'

  return garminVerbunden ? 'keine-daten' : 'nicht-verbunden'
}

/**
 * Ob der Körperdaten-Block etwas zu zeigen hat. Bewusst an den Daten und nicht am
 * Zustand: Während eines Laufs sind die schon geholten Tage zu sehen, mit dem
 * Ladehinweis darüber — `laeuft` beschreibt, was *zusätzlich* passiert, nicht was die
 * Seite ersetzt.
 *
 * Hieß bis Issue #60 `zeigtVerlaeufe`, weil die Startseite *war* das Dashboard. Sie
 * zeigt jetzt die Kachelzeile; die Verläufe liegen unter `/dashboard` und stellen diese
 * Frage gar nicht — wer dort landet, hat Körperdaten.
 */
export function zeigtKoerperdaten(
  zustand: StartseitenZustand,
  hatKoerperdaten: boolean,
): boolean {
  return zustand === 'daten' || (zustand === 'laeuft' && hatKoerperdaten)
}

/**
 * Eng, solange geholt wird: Ein Lauf dauert rund eine Minute, und der Athlet sieht ihm
 * zu. Wie beim Knopf in den Einstellungen keine zwei Sekunden — der Zustand liegt im
 * KV und ist *eventually consistent*, häufiger zu fragen liefert dieselbe Antwort.
 */
export const ABFRAGE_INTERVALL_LAEUFT_MS = 10_000

/**
 * Ruhiger in den wartenden Zuständen: Dort ändert sich etwas durch einen anderen Tab
 * (gerade verbunden) oder den nächtlichen Cron — beides nichts, wofür jemand auf die
 * Sekunde wartet. Nur damit die Seite von selbst weiterspringt, statt neu geladen
 * werden zu müssen.
 */
export const ABFRAGE_INTERVALL_WARTEND_MS = 30_000

/**
 * Wie oft die Seite nachfragt; `null` heißt: gar nicht mehr.
 *
 * Zwei Gründe nachzufragen, und beide zählen einzeln (Issue #57): der Zustand der
 * Körperdaten und die offene Einrichtung. Der zweite steht ausdrücklich daneben, seit
 * die Einrichtung kein Zustand mehr ist — sonst hörte ausgerechnet das Konto mit
 * Verläufen und offenem Connector auf zu fragen, also genau das, für das der Haken
 * gleich von außen gesetzt wird.
 */
export function abfrageIntervallMs(
  zustand: StartseitenZustand,
  einrichtungOffen: boolean,
): number | null {
  if (zustand === 'laeuft') return ABFRAGE_INTERVALL_LAEUFT_MS
  if (zustand === 'daten' && !einrichtungOffen) return null
  return ABFRAGE_INTERVALL_WARTEND_MS
}
