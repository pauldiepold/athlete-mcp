/**
 * Der tägliche Körperdaten-Cron als Nitro-Task (ADR-0007) — vorher der
 * `scheduled`-Export des MCP-Workers.
 *
 * Reiner Adapter: die Fachlichkeit liegt in `laufeKoerperdatenCron` im
 * Garmin-Kontext, hier werden nur die Bindings und „heute" hereingereicht.
 *
 * **Der Task-Name kommt aus dem Dateipfad** (`server/tasks/koerperdaten.ts` →
 * `koerperdaten`), nicht aus `meta.name`. Der `scheduledTasks`-Eintrag in
 * nuxt.config.ts muss deshalb auf den Dateinamen zeigen: ein Eintrag auf einen
 * nicht existierenden Namen wird beim Build nur als Warnung geloggt, und der Cron
 * liefe still ins Leere.
 *
 * Ausgelöst wird der Task von `triggers.crons` des Workers. In der Testumgebung
 * ist bewusst keiner gesetzt (zwei Läufe gegen dieselben Garmin-Konten wären ein
 * unnötiges Rate-Limit-Risiko); nachweisbar ist er dort über
 * `pnpm dev:cron` + `curl "http://localhost:8787/__scheduled?cron=0+5+*+*+*"`.
 */

import { KoerperdatenArchive } from '@shared/garmin/koerperdatenArchive'
import { laufeKoerperdatenCron } from '@shared/garmin/koerperdatenCron'
import { heuteInBerlin } from '@shared/zeitzone'

export default defineTask({
  meta: {
    name: 'koerperdaten',
    description: 'Holt pro Garmin-Athlet die offenen Körperdaten-Tage nach',
  },
  async run({ context }) {
    const env = (context as { cloudflare?: { env?: Env } }).cloudflare?.env
    if (!env) {
      throw new Error('Körperdaten-Cron ohne Cloudflare-Bindings aufgerufen')
    }

    const bilanzen = await laufeKoerperdatenCron({
      kv: env.SESSION_KV,
      archiv: new KoerperdatenArchive(env.ATHLETE_DB),
      heute: heuteInBerlin(),
    })

    return { result: bilanzen }
  },
})
