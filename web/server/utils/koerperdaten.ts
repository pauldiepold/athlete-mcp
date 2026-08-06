import type { H3Event } from 'h3'
import { KoerperdatenArchive } from '@shared/garmin/koerperdatenArchive'

// Gemeinsame Zugriffs-Sequenz der Körperdaten-Routes (Issue #24): Athlet über
// die Session auflösen (resolveAthlet — dieselbe Auflösung wie die Steuerungs-Routes)
// und das Archiv dazugeben. Ohne Session → 401.
//
// Gelesen wird über dasselbe KoerperdatenArchive, das auch der MCP-Endpunkt nutzt:
// kein zweiter Lesepfad auf die Tabelle. Die Browser-Fläche bleibt reiner D1-Leser
// und holt nichts live bei Garmin (ADR-0004); die Aktualität des laufenden Tages ist
// Sache der Read-through-Orchestrierung hinter den MCP-Tools (Garmin-ADR-0002).
export async function resolveKoerperdaten(
  event: H3Event,
): Promise<{ userId: string; archiv: KoerperdatenArchive }> {
  const { userId, env } = await resolveAthlet(event)

  return { userId, archiv: new KoerperdatenArchive(env.ATHLETE_DB) }
}
