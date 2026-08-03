import type { H3Event } from 'h3'
import { KoerperdatenArchive } from '@shared/garmin/koerperdatenArchive'

// Gemeinsame Zugriffs-Sequenz der Körperdaten-Routes (Issue #24): Athlet über das
// View-Secret auflösen (resolveAthlet — dieselbe Auflösung wie die Steuerungs-Routes)
// und das Archiv dazugeben. Unbekanntes/fehlendes Secret → 404.
//
// Gelesen wird über dasselbe KoerperdatenArchive, das auch der MCP-Worker nutzt:
// kein zweiter Lesepfad auf die Tabelle. Das Web-Target bleibt reiner D1-Leser und
// holt nichts live bei Garmin (ADR-0004); die Aktualität des laufenden Tages ist
// Sache der Read-through-Orchestrierung im MCP-Worker (Garmin-ADR-0002).
export async function resolveKoerperdaten(
  event: H3Event,
): Promise<{ userId: string; archiv: KoerperdatenArchive }> {
  const { userId, env } = await resolveAthlet(event)

  return { userId, archiv: new KoerperdatenArchive(env.ATHLETE_DB) }
}
