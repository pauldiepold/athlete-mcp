/**
 * Die Flächen, mit denen der Athlet täglich arbeitet — an einer Stelle, weil sie an
 * zwei Orten erscheinen: als Knöpfe in der Kopfzeile (AthletHeader, ab `sm`) und als
 * Tabs in der unteren Leiste (AthletTabLeiste, bis `sm`). Zwei Listen wären zwei
 * Wahrheiten darüber, welche Flächen es gibt und wie sie heißen.
 *
 * **Deutsch, weil der Rest der Oberfläche deutsch ist**: „Körperdaten" statt
 * „Dashboard" — das ist der Inhalt, während „Dashboard" nur ein Fremdwort für dasselbe
 * wäre. Der *Pfad* heißt trotzdem weiter `/dashboard`: Pfade liest niemand vor, und ein
 * Umbenennen bräche jeden geteilten Link.
 *
 * `pfade` sagt, unter welchen Pfaden eine Fläche als „hier bist du" gilt — die
 * Tagesansicht `/tag/2026-06-24` gehört zu den Körperdaten, auch wenn sie anders heißt.
 * Die Kopfzeile bekommt ihren Bereich weiter als Prop von der Seite; die Tab-Leiste
 * hängt an keiner Seite und liest ihn deshalb aus der Route.
 */
export type Bereich = 'start' | 'koerperdaten' | 'steuerung' | 'einstellungen'

export type Flaeche = {
  bereich: Bereich
  label: string
  icon: string
  to: string
  pfade: readonly string[]
}

/**
 * Der Start steht **nicht** hier drin: In der Kopfzeile ist er die Wortmarke links, in
 * der Tab-Leiste ein eigener erster Tab. Eine gemeinsame Liste hätte ihn in der
 * Kopfzeile doppelt gezeigt — genau der Knopf, der in Issue #60 entfallen ist.
 */
export const ATHLET_FLAECHEN: readonly Flaeche[] = [
  {
    bereich: 'koerperdaten',
    label: 'Körperdaten',
    icon: 'i-lucide-activity',
    to: '/dashboard',
    pfade: ['/dashboard', '/tag'],
  },
  {
    bereich: 'steuerung',
    label: 'Trainingsbuch',
    icon: 'i-lucide-notebook-pen',
    to: '/steuerung',
    pfade: ['/steuerung'],
  },
] as const

export const START_FLAECHE: Flaeche = {
  bereich: 'start',
  label: 'Start',
  icon: 'i-lucide-house',
  to: '/',
  pfade: ['/'],
}

/**
 * Welche Fläche zu einem Pfad gehört — `/` nur exakt, alles andere als Präfix, damit
 * `/steuerung/2026-W25` beim Trainingsbuch landet. `/einstellungen` gehört zu keiner
 * Fläche: Die Einstellungen hängen im Konto-Menü, und ein hervorgehobener Tab würde
 * eine tägliche Fläche behaupten, die sie nicht sind.
 */
export function flaecheFuerPfad(pfad: string): Bereich | undefined {
  if (pfad === '/') return 'start'
  return [...ATHLET_FLAECHEN].find((f) =>
    f.pfade.some((p) => p !== '/' && (pfad === p || pfad.startsWith(`${p}/`))),
  )?.bereich
}

/**
 * Flächen mit Athleten-Navigation. Die Anmeldung, der OAuth-Consent und die
 * Einladungs-Annahme tragen sie nicht — dort gibt es noch nichts zu navigieren —, die
 * Admin-Fläche ebenso wenig: Sie ist die Fläche des Operators und hat ihre eigene.
 */
export function hatAthletNavigation(pfad: string): boolean {
  if (pfad === '/' || pfad === '/einstellungen') return true
  return flaecheFuerPfad(pfad) !== undefined
}
