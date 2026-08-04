/**
 * Die Ausschnitte des Zeitraum-Umschalters (Issue #25) — der einzige Ort, an dem
 * sie stehen. Der Bereichs-Endpunkt liest sie aus der Query, der Umschalter baut
 * daraus seine Knöpfe; beide Seiten können damit nicht auseinanderlaufen.
 *
 * `null` steht für „Alles": kein festes Fenster, sondern der Verlauf ab dem ersten
 * archivierten Tag.
 */
export const ZEITRAEUME = { '30': 30, '90': 90, alles: null } as const

export type ZeitraumName = keyof typeof ZEITRAEUME

/** Der Standard beim Öffnen der Seite: der Ausschnitt, der die meisten Fragen trägt. */
export const ZEITRAUM_STANDARD: ZeitraumName = '30'

/** Alles Unbekannte (getippte URL, alter Link) fällt still auf den Standard zurück. */
export function alsZeitraumName(wert: unknown): ZeitraumName {
  return typeof wert === 'string' && wert in ZEITRAEUME
    ? (wert as ZeitraumName)
    : ZEITRAUM_STANDARD
}
