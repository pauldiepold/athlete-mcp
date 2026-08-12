import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'

/**
 * In welchem Fall die *Erstbefüllung* gerade steckt (Issue #48) — als reine Funktion,
 * weil die **Reihenfolge** der Fälle das Eigentliche daran ist und in einer
 * Template-Kette nicht prüfbar wäre.
 *
 * **Der Fall, nicht der Wortlaut.** Zwei Flächen zeigen denselben Lauf und reden
 * verschieden über ihn: der Knopf unter der Garmin-Karte einzeilig und nebenbei, die
 * Karte auf der Startseite mit Überschrift und zwei Sätzen. Beide leiteten ihre Sätze
 * lange aus eigenen if-Bäumen über dieselben Eingaben ab — der eine getestet, der
 * andere nicht, und schon war „Garmin hat nichts geliefert" an der einen Fläche ein
 * Fehler und an der anderen ein Ergebnis. Geteilt wird deshalb die Entscheidung, welcher
 * Fall vorliegt; den Satz formuliert jede Fläche weiterhin selbst.
 *
 * **Der Lauf allein reicht dafür nicht.** Er stand hier lange als einzige Eingabe, und
 * genau daran ging es kaputt: Wessen Archiv der nächtliche Cron oder ein Backfill
 * gefüllt hat, hat nie einen Lauf gehabt — und las trotzdem „noch nicht geholt worden"
 * über vollständigen Daten. Der Knopf darunter tat dann folgerichtig nichts, denn ohne
 * offene Tage stößt die Route keinen Lauf an. Zweimal dieselbe Ursache: Die Wahrheit
 * über die Daten steht im **Archiv**, nicht im Zustand des letzten Laufs.
 *
 * Der Lauf erklärt weiterhin, *warum* etwas fehlt — er ist die zweite Eingabe, nicht
 * die erste.
 */
export type ErstbefuellungsFall
  = /** Es wird gerade geholt; niemand soll ein zweites Mal anstoßen. */
  | 'laeuft'
  /** Das 30-Tage-Fenster liegt vollständig im Archiv — egal, woher die Tage kamen. */
  | 'vollstaendig'
  /** Es lief noch nie einer, und es fehlt etwas. */
  | 'nie-gelaufen'
  /** Der letzte Lauf ist gescheitert. */
  | 'gescheitert'
  /** Durchgelaufen, ohne einen einzigen Tag zu schreiben: Garmin hatte nichts. */
  | 'leer-geliefert'
  /** Durchgelaufen, etwas geholt — und trotzdem fehlen Tage. */
  | 'unvollstaendig'

export interface ErstbefuellungsEingaben {
  /** Der letzte Lauf, wenn es je einen gab. */
  lauf: ErstbefuellungLauf | null
  /**
   * Wie viele Tage des 30-Tage-Fensters im Archiv fehlen. `null` heißt „nicht
   * feststellbar" (Archiv nicht lesbar) — dann entscheidet allein der Lauf, und der
   * Knopf bleibt anklickbar, statt einen Athleten vor einem toten Knopf zu lassen.
   */
  offen: number | null
}

export function erstbefuellungsFall({
  lauf,
  offen,
}: ErstbefuellungsEingaben): ErstbefuellungsFall {
  // Der laufende Lauf zuerst, wie auf der Startseite: An ihm hängt, dass kein zweiter
  // Klick in ein rate-limitiertes Garmin fährt.
  if (lauf?.status === 'laeuft') return 'laeuft'

  // Vollständiges Fenster schlägt jeden Lauf: Woher die Tage kamen — Erstbefüllung,
  // Cron oder Backfill —, ist für den Athleten dieselbe Aussage.
  if (offen === 0) return 'vollstaendig'

  if (!lauf) return 'nie-gelaufen'

  if (lauf.status === 'gescheitert') return 'gescheitert'

  // Durchgelaufen und nichts geschrieben ist kein Fehler, sondern ein Ergebnis: Für
  // diese Tage hatte Garmin nichts. Ein zweiter Versuch lohnt trotzdem, sobald die Uhr
  // wieder synchronisiert hat.
  if (lauf.geschrieben === 0) return 'leer-geliefert'

  // Durchgelaufen, und trotzdem fehlt etwas. Ein teilweise gescheiterter Lauf sähe
  // sonst aus wie ein geglückter: „20 Tage geholt" ohne den Hinweis, dass zehn fehlen,
  // und der Athlet hätte keinen Anlass, den Knopf noch einmal zu drücken.
  return 'unvollstaendig'
}

/**
 * Ob es überhaupt etwas zu holen gibt.
 *
 * Nur zwei Fälle sperren, und beide aus einem eigenen Grund: Während eines Laufs
 * provozierte ein anklickbarer Knopf den Doppelklick gegen ein rate-limitiertes Garmin.
 * Bei vollständigem Fenster verspräche er eine Wirkung, die die Route gar nicht haben
 * kann — sie überspringt archivierte Tage und stieße nichts an.
 *
 * Am Fall und nicht an den Eingaben, damit es **eine** Fundstelle bleibt: Ein
 * unlesbares Archiv (`offen === null`) sperrt den Knopf ausdrücklich **nicht** — es ist
 * keine Aussage über die Daten, und ein toter Knopf wäre die schlechtere Antwort darauf.
 */
export function knopfAktiv(fall: ErstbefuellungsFall): boolean {
  return fall !== 'laeuft' && fall !== 'vollstaendig'
}

/**
 * Wie oft eine Fläche den Stand nachgefragt haben möchte: ein Abstand in Millisekunden,
 * oder `null` für „von mir aus gar nicht".
 */
export type Taktwunsch = number | null

/**
 * Der **eine** Abfrage-Takt auf den Erstbefüllungs-Lauf — aus allen Wünschen der gerade
 * montierten Flächen der kleinste; `null`, wenn keine etwas will.
 *
 * Es gibt einen Lauf, einen beobachtenden Abruf und deshalb genau ein Intervall. Danach
 * zu fragen kamen bisher mehrere, jede mit eigenem Timer auf denselben Abruf: Der Knopf
 * wird von zwei unabhängigen Eltern montiert (Einstellungs-Seite und Einrichtungs-Karte,
 * die auf `/einstellungen` beide dastehen), und die Einrichtungs-Karte steht bei offener
 * Einrichtung **auch auf der Startseite** — dort neben dem Takt der Seite selbst.
 * Doppelte Anfragen für dieselbe Antwort, und im Zehnsekundentakt merkt man das. Props
 * durchzureichen ginge nicht: Dazu müssten sich Eltern absprechen, die einander nicht
 * kennen.
 *
 * **Der kleinste gewinnt**, nicht der erste: Die Wünsche sind verschieden und keiner ist
 * der richtigere. Der Knopf will nur während eines Laufs etwas wissen (dann eng, alle
 * zehn Sekunden), die Startseite auch in den wartenden Zuständen (ruhiger, alle
 * dreißig). Der weitere Takt würde den engen verschlucken — und dann sähe ein Athlet dem
 * laufenden Abruf zu, während die Zahlen dreißig Sekunden alt stehen bleiben. Umgekehrt
 * ist ein zu enger Takt nur bezahlt, nicht falsch, und er entsteht ohnehin nur, solange
 * jemand ihn ausdrücklich will.
 *
 * `null` schweigt mit: Ein „gar nicht" hält niemanden auf, es zählt nur, wenn alle es
 * sagen — dann gibt es kein Intervall. Im eingeschwungenen Fall (Daten da, Einrichtung
 * fertig, kein Lauf) ist das der Normalzustand, und die Seite hört wirklich auf zu
 * fragen.
 *
 * Rein und ohne Timer, damit die Zusicherung „zwei Beobachter, ein Intervall" prüfbar
 * ist: Was gefragt wird, entscheidet hier, das `setInterval` hängt nur am Ergebnis.
 */
export function taktIntervall(wuensche: Iterable<Taktwunsch>): number | null {
  let kleinster: number | null = null

  for (const wunsch of wuensche) {
    if (wunsch === null) continue
    if (kleinster === null || wunsch < kleinster) kleinster = wunsch
  }

  return kleinster
}
