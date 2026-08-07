import { einloesenInvite } from '@shared/identitaet'
import { z } from 'zod'

/**
 * Der einzige Weg, auf dem ein Konto entsteht: Einlösen eines Invite-Codes für die
 * Identität, die gerade aus dem Provider-Login wartet.
 *
 * Die Identität kommt **nicht** aus dem Request, sondern aus dem `pending`-Teil der
 * Session — sonst könnte jeder mit einem fremden Code ein Konto an seinen eigenen
 * `sub` hängen. Vom Client kommen nur Code und Anzeigename.
 *
 * Unbekannter, verbrauchter und abgelaufener Code sind derselbe Fall und bekommen
 * dieselbe Meldung: Wer nicht weiß, welcher davon zutrifft, kann auch keinen Code
 * durchprobieren und aus der Antwort etwas lernen.
 */
const KOERPER = z.object({
  code: z.string().trim().min(1),
  anzeigename: z.string().trim().max(80).optional(),
})

export default defineEventHandler(async (event) => {
  const { secure } = await getUserSession(event)
  const pending = secure?.pending
  if (!pending) {
    throw createError({ statusCode: 401, statusMessage: 'Keine offene Anmeldung' })
  }

  const eingabe = KOERPER.safeParse(await readBody(event))
  if (!eingabe.success) {
    throw athletenFehler(400, 'Bitte gib deinen Invite-Code ein.')
  }

  const ergebnis = await einloesenInvite(envOf(event).SESSION_KV, {
    code: eingabe.data.code,
    provider: pending.provider,
    sub: pending.sub,
    // Der Athlet bestätigt die Vorbelegung oder korrigiert sie; leer ist erlaubt.
    anzeigename: eingabe.data.anzeigename ?? pending.name,
    email: pending.email,
  })

  if (!ergebnis.ok) {
    throw athletenFehler(
      403,
      'Dieser Invite-Code ist unbekannt oder nicht mehr gültig. Bitte melde dich beim Operator.',
    )
  }

  await setzeAthletenSession(
    event,
    ergebnis.userId,
    { provider: pending.provider, sub: pending.sub },
    ergebnis.profil,
  )

  return { redirectTo: pending.redirectTo }
})
