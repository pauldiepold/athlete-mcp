import { wochenZeitraum } from '@shared/garmin/isoWoche'

/**
 * Wie eine Kalenderwoche am Nutzer heißt — „KW 33 · 10.–16. August".
 *
 * Stand als lokale Funktion in `WochenWahl`, wird aber seit dem Wochen-Streifen der
 * Startseite an zwei Stellen gebraucht. Zwei Formatierungen derselben Woche wären
 * genau die Art Drift, die niemand meldet: Die Überschrift des Trainingsbuchs und der
 * Weg dorthin von der Startseite müssen dieselbe Woche gleich benennen, sonst liest es
 * sich wie zwei verschiedene.
 *
 * Rein — kein Fetch, keine Uhr. Welche Woche gemeint ist, entscheidet der Aufrufer.
 */

const tagMonat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })
const tag = new Intl.DateTimeFormat('de-DE', { day: 'numeric' })

/**
 * „10.–16. August" — der Zeitraum sagt einem Athleten mehr als die Wochennummer
 * allein: Wochennummern kennt kaum jemand auswendig, das Datum des letzten langen
 * Laufs schon.
 */
export function zeitraumText(kw: string): string {
  const { von, bis } = wochenZeitraum(kw)
  const montag = new Date(`${von}T00:00:00Z`)
  const sonntag = new Date(`${bis}T00:00:00Z`)
  // Innerhalb eines Monats steht der Monatsname nur einmal („22.–28. Juni"),
  // über die Monatsgrenze zweimal („29. Juni – 5. Juli").
  return montag.getUTCMonth() === sonntag.getUTCMonth()
    ? `${tag.format(montag)}.–${tagMonat.format(sonntag)}`
    : `${tagMonat.format(montag)} – ${tagMonat.format(sonntag)}`
}

/** „2026-W26" → „KW 26" — das Jahr steht im Zeitraum daneben. */
export function kwKurz(kw: string): string {
  return `KW ${kw.slice(6)}`
}

/** Beides zusammen: „KW 26 · 22.–28. Juni". */
export function wochenTitel(kw: string): string {
  return `${kwKurz(kw)} · ${zeitraumText(kw)}`
}
