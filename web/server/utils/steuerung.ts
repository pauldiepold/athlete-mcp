import type { H3Event } from 'h3'
import { TenantResolver } from '@shared/tenantResolver'
import { SteuerungStore } from '@shared/steuerung/steuerungStore'

// Gemeinsame Zugriffs-Sequenz aller Steuerungs-Routes (Issue #12/#13): löst das
// View-Secret aus der URL server-seitig auf — Bindings bleiben im Server, landen nie
// im Bundle (ADR-0004) — und liefert den Nutzer samt Store. Unbekanntes/fehlendes
// Secret → 404. Eine Stelle für die Mandantentrennung statt vier identischer Kopien;
// ein falsches Mapping würde fremde Daten ausliefern.
export async function resolveSteuerung(
  event: H3Event,
): Promise<{ userId: string; store: SteuerungStore }> {
  const env = event.context.cloudflare.env as unknown as Env
  const secret = getRouterParam(event, 'secret')!

  const userId = await new TenantResolver(env.SESSION_KV).resolveViewSecret(secret)
  if (!userId) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return { userId, store: new SteuerungStore(env.ATHLETE_DB) }
}
