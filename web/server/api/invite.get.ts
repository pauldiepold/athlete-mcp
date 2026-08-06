/**
 * Was die Invite-Fläche über die wartende Identität wissen darf: das Verfahren und
 * die **Vorbelegung** des Anzeigenamens. Der `sub` bleibt server-seitig — er ist der
 * Anker der Anmeldung, nicht Anzeige-Material.
 *
 * 401 heißt hier: kein Provider-Login im Gang. Wer die Seite ohne vorherige Anmeldung
 * öffnet, hat nichts einzulösen.
 */
export default defineEventHandler(async (event) => {
  const { secure } = await getUserSession(event)
  const pending = secure?.pending
  if (!pending) {
    throw createError({ statusCode: 401, statusMessage: 'Keine offene Anmeldung' })
  }

  return {
    provider: pending.provider,
    namensvorschlag: pending.name,
  }
})
