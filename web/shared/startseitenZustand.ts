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
 * Ob die Seite ein **löchriges Fenster** anspricht (Issue #67) — der Hinweis mit dem
 * Knopf, der über der Kachelzeile steht.
 *
 * **Kein fünfter Zustand, sondern ein Hinweis im Körperdaten-Block.** Der Zustand
 * entscheidet, was *an Stelle* der Kachelzeile steht; hier steht sie zu Recht da — sie
 * zeigt, was vorhanden ist, und ist bei einem halb gefüllten Fenster nicht falsch,
 * sondern unvollständig. Ein fünfter Fall müsste sie entweder verdrängen (und nähme dem
 * Athleten seine Daten für eine Randnotiz) oder nichts tun (und wäre kein Zustand). Also
 * dieselbe Bauart wie der Verbindungs-Hinweis: eine Zeile darüber, die sagt, warum
 * darunter etwas fehlt.
 *
 * **Nur im Zustand `daten`.** Die drei anderen reden schon über dieselbe Sache und
 * dürfen nicht doppelt: `laeuft` hat den Ladehinweis, `keine-daten` die Karte mit
 * demselben Knopf, `nicht-verbunden` den Verbindungs-Hinweis — und dort wäre der Knopf
 * ohnehin tot, weil ohne Verbindung nichts anzustoßen ist.
 *
 * **Verschleppt und nicht `offen`** ist die eigentliche Entscheidung: Ein einzelner
 * fehlender Tag ist der Normalfall, den der Cron morgen früh selbst holt — eine Fläche,
 * die *jede* Lücke meldet, meldet an den meisten Morgen etwas und wird dadurch zur
 * Tapete. Gemeint sind die Tage, an die der Cron nicht mehr herankommt (`verschleppteTage`,
 * ADR-0003): Die bleiben leer, bis jemand drückt. `null` (Archiv nicht lesbar) ist keine
 * Aussage über die Daten und schweigt deshalb.
 */
export function zeigtLueckenHinweis(
  zustand: StartseitenZustand,
  verschleppt: number | null,
): boolean {
  return zustand === 'daten' && verschleppt !== null && verschleppt > 0
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
