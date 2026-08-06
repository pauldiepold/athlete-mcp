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
 * Hier im Web-Target und nicht in `src/`, weil das keine Garmin-Fachlichkeit ist,
 * sondern die Politik einer Fläche: welcher Hinweis zu welchem Zustand gehört. Rein
 * und getestet bleibt sie trotzdem — die Reihenfolge der Fälle ist das Eigentliche
 * daran, und die ist in einer Vue-Template-Kette nicht prüfbar.
 */
export type StartseitenZustand
  = /** Ein Pflichtschritt der Einrichtung fehlt noch — sie steht an dieser Stelle. */
  | 'einrichtung'
  /** Ohne Garmin gibt es nichts zu zeigen — der Weg führt in die Einstellungen. */
  | 'nicht-verbunden'
  /** Die Erstbefüllung holt gerade; was schon da ist, wird trotzdem gezeigt. */
  | 'laeuft'
  /** Verbunden, aber leer und kein Lauf — der Athlet kann das Holen anstoßen. */
  | 'keine-daten'
  /** Der Normalfall: Verläufe. */
  | 'daten'

export interface StartseitenEingaben {
  /** Fehlt noch ein Pflichtschritt der Einrichtung (Issue #52)? */
  einrichtungOffen: boolean
  garminVerbunden: boolean
  hatKoerperdaten: boolean
  lauf: ErstbefuellungLauf | null
}

export function startseitenZustand({
  einrichtungOffen,
  garminVerbunden,
  hatKoerperdaten,
  lauf,
}: StartseitenEingaben): StartseitenZustand {
  // Die Einrichtung vor allem anderen — auch vor dem laufenden Lauf und vor
  // vorhandenen Daten (Issue #52). Sie tritt an die Stelle des Dashboards, bis alle
  // Pflichtschritte stehen: Ohne Connector kommt Claude gar nicht an diese Daten, und
  // wer stattdessen Verläufe zu sehen bekäme, hielte die Einrichtung für erledigt.
  //
  // Die Erstbefüllung stört das nicht — sie läuft im Hintergrund weiter, während der
  // Athlet die übrigen Schritte macht. Genau deshalb steht Garmin dort zuerst.
  if (einrichtungOffen) return 'einrichtung'

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
 * Ob die Verläufe gerendert werden. Bewusst an den Daten und nicht am Zustand: Während
 * eines Laufs sind die schon geholten Tage zu sehen, mit dem Ladehinweis darüber —
 * `laeuft` beschreibt, was *zusätzlich* passiert, nicht was die Seite ersetzt.
 */
export function zeigtVerlaeufe(
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

/** Wie oft die Seite nachfragt; `null` heißt: gar nicht mehr. */
export function abfrageIntervallMs(zustand: StartseitenZustand): number | null {
  if (zustand === 'daten') return null
  return zustand === 'laeuft' ? ABFRAGE_INTERVALL_LAEUFT_MS : ABFRAGE_INTERVALL_WARTEND_MS
}
