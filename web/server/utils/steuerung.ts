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
