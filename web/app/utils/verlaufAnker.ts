/**
 * Die Anker der ausführlichen Verläufe — die Sprungziele, zu denen ein Klick auf eine
 * Kachel der Kachelzeile führt.
 *
 * An einer Stelle, weil zwei Komponenten dieselben Zeichenketten kennen müssen: die
 * Charts (KoerperdatenVerlaeufe) setzen die `id`, die Kacheln (KoerperdatenKacheln)
 * zeigen darauf. Abgeschrieben wäre ein Tippfehler ein Klick, der nichts tut — ohne
 * Fehler, ohne Hinweis.
 *
 * Die Zuordnung ist nicht eins zu eins: „Bereitschaft" und „Akute Last" sind zwei
 * Kacheln, aber ein Verlauf (sie stehen dort gegeneinander). Deshalb ein eigener
 * Schlüsselsatz statt der Marker-Namen aus den Serien.
 */
export const VERLAUF_ANKER = {
  index: 'verlauf-index',
  hrv: 'verlauf-hrv',
  bereitschaft: 'verlauf-bereitschaft',
  schlaf: 'verlauf-schlaf',
  ruhepuls: 'verlauf-ruhepuls',
  bodyBattery: 'verlauf-body-battery',
} as const
