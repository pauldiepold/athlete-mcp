import { FinalSurgeLoginFehler, login } from '@shared/finalsurge/finalSurgeClient'
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
    throw athletenFehler(400, 'Bitte gib E-Mail-Adresse und Passwort ein.')
  }

  try {
    await login(eingabe.data.email, eingabe.data.password)
  } catch (err) {
    // Die rohe Meldung bleibt im Log — sie trägt HTTP-Innereien, die niemanden im
    // Formular weiterbringen. Was der Athlet sieht, hängt am `grund`: „prüf dein
    // Passwort" auf einen Ausfall bei Final Surge zu antworten, schickt ihn auf die
    // Suche nach einem Fehler, den er nicht hat.
    console.error('Final-Surge-Login beim Verbinden gescheitert:', err)
    throw athletenFehler(
      400,
      err instanceof FinalSurgeLoginFehler
        ? err.benutzerMeldung
        : 'Das Verbinden mit Final Surge hat nicht geklappt. Bitte versuch es noch einmal.',
    )
  }

  await speichereFinalSurge(env.SESSION_KV, userId, eingabe.data)

  return { ok: true }
})
