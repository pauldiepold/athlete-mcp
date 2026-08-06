import { loeseMfaZustandEin } from '@shared/garmin/garminMfaSpeicher'
import { beendeGarminLoginMitMfa } from '@shared/garmin/garminSsoLogin'
import { speichereGarmin } from '@shared/verbindungen'
import { z } from 'zod'

/**
 * Der zweite Schritt des Garmin-Logins: den Bestätigungscode einlösen (Issue #44).
 *
 * Der Handle kommt vom Client, der Zustand dahinter aus dem KV — und er ist an das
 * Konto gebunden, das ihn angelegt hat. Ein fremder oder abgelaufener Handle ist
 * derselbe Fall: Der Ablauf beginnt von vorn, statt dass jemand aus der Antwort etwas
 * über andere Konten lernt.
 *
 * Der Zwischenzustand ist mit diesem Request verbraucht, auch wenn Garmin den Code
 * ablehnt: Dasselbe CSRF-Token nimmt Garmin ohnehin kein zweites Mal an. Der Athlet
 * fängt dann sauber neu an, statt in einem toten Handle festzuhängen.
 */
const KOERPER = z.object({
  handle: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(20),
})

export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)

  const eingabe = KOERPER.safeParse(await readBody(event))
  if (!eingabe.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bitte gib den Bestätigungscode ein.',
    })
  }

  const zustand = await loeseMfaZustandEin(
    env.SESSION_KV,
    userId,
    eingabe.data.handle,
  )
  if (!zustand) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Dieser Anmeldeversuch ist abgelaufen. Bitte fang die Verbindung noch einmal an.',
    })
  }

  const anmeldung = await mitGarminFehler('Garmin-MFA', () =>
    beendeGarminLoginMitMfa(zustand, eingabe.data.code),
  )

  await speichereGarmin(env.SESSION_KV, userId, anmeldung)
  return { art: 'fertig' as const }
})
