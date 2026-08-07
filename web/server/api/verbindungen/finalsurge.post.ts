import { login } from '@shared/finalsurge/finalSurgeClient'
import { speichereFinalSurge } from '@shared/verbindungen'
import { z } from 'zod'

/**
 * Der Athlet verbindet Final Surge selbst (Issue #44) — vorher tippte der Operator
 * fremde Passwörter in ein CLI.
 *
 * **Erst prüfen, dann speichern.** Die Zugangsdaten gehen sofort durch einen echten
 * Login; erst was Final Surge akzeptiert hat, landet im KV. Ein Tippfehler fällt so im
 * Formular auf und nicht Tage später an leeren Plandaten — der Fall, in dem niemand
 * mehr an das Formular denkt.
 *
 * Die Passwörter liegen danach im Klartext im KV. Das ist aufgeschoben, nicht
 * übersehen: Issue #35.
 */
const KOERPER = z.object({
  email: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
})

export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)

  const eingabe = KOERPER.safeParse(await readBody(event))
  if (!eingabe.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bitte gib E-Mail-Adresse und Passwort ein.',
    })
  }

  try {
    await login(eingabe.data.email, eingabe.data.password)
  } catch (err) {
    // Die rohe Meldung bleibt im Log: Sie unterscheidet „falsches Passwort" von
    // „Final Surge ist gerade weg", trägt aber HTTP-Innereien, die niemanden im
    // Formular weiterbringen.
    console.error('Final-Surge-Login beim Verbinden gescheitert:', err)
    throw createError({
      statusCode: 400,
      statusMessage:
        'Final Surge hat die Anmeldung abgelehnt. Bitte prüf E-Mail-Adresse und '
        + 'Passwort — es sind die Daten von Final Surge, nicht die dieser Seite.',
    })
  }

  await speichereFinalSurge(env.SESSION_KV, userId, eingabe.data)

  return { ok: true }
})
