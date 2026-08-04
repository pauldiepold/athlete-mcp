import type { H3Event } from 'h3'
import { SteuerungStore } from '@shared/steuerung/steuerungStore'

// Gemeinsame Zugriffs-Sequenz aller Steuerungs-Routes (Issue #12/#13): Athlet über
// das View-Secret auflösen (resolveAthlet — dieselbe Auflösung wie die
// Körperdaten-Routes, Issue #24) und den Store dazugeben. Unbekanntes/fehlendes
// Secret → 404.
export async function resolveSteuerung(
  event: H3Event,
): Promise<{ userId: string; store: SteuerungStore }> {
  const { userId, env } = await resolveAthlet(event)

  return { userId, store: new SteuerungStore(env.ATHLETE_DB) }
}

/**
 * Der Auszug eines Wocheneintrags für die Dashboard-Wochenliste (Issue #28): die
 * erste nicht-leere Zeile des Markdowns — ob Überschrift oder Fließtext —, ohne
 * führende `#`-Zeichen und auf eine handliche Länge gekürzt. Ein leerer Eintrag
 * ergibt eine leere Zeichenkette, keinen Fehler: „ohne Auszug" ist ein normaler
 * Fall der Liste, keiner, den man extra behandeln müsste.
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
