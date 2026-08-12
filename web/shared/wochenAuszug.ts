/**
 * Der Auszug eines Wocheneintrags: die erste nicht-leere Zeile des Markdowns — ob
 * Überschrift oder Fließtext —, ohne führende `#`-Zeichen und auf eine handliche Länge
 * gekürzt. Ein leerer Eintrag ergibt eine leere Zeichenkette, keinen Fehler: „ohne
 * Auszug" ist ein normaler Fall, keiner, den man extra behandeln müsste.
 *
 * Lag bis zum Wochen-Streifen der Startseite in `server/utils/steuerung.ts` — er wird
 * jetzt auf beiden Seiten gebraucht: server-seitig für die Dashboard-Wochenliste
 * (Issue #28), im Browser für den Streifen, der die laufende Woche anreißt. Eine
 * zweite Kürzung im Client hieße, dass dieselbe Woche an zwei Stellen verschieden
 * abbricht.
 */
export function wochenAuszug(markdown: string): string {
  const ersteZeile = markdown
    .split('\n')
    .map((zeile) => zeile.trim())
    .find((zeile) => zeile.length > 0) ?? ''

  const ohneUeberschriftenzeichen = ersteZeile.replace(/^#+\s*/, '')

  const MAX_LAENGE = 140
  return ohneUeberschriftenzeichen.length > MAX_LAENGE
    ? `${ohneUeberschriftenzeichen.slice(0, MAX_LAENGE - 1)}…`
    : ohneUeberschriftenzeichen
}
