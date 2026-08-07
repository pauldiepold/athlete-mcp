import { createInvite } from '@shared/identitaet'
import { z } from 'zod'

/**
 * Stellt einen Invite-Code aus (ADR-0007). Zwei Sorten, unterschieden allein dadurch,
 * ob eine `userId` mitkommt:
 *
 * - **frei** — legt beim Einlösen ein neues, leeres Konto mit generierter `userId` an.
 *   Das Einladungstor; es später zu öffnen heißt, hier eine Prüfung zu entfernen,
 *   nicht die Identität umzubauen.
 * - **kontogebunden** — hängt eine Identität an ein *bestehendes* Konto und ersetzt
 *   dessen bisherige. Der Verfahrenswechsel: der Weg, mit dem die Bestandsathleten
 *   migriert werden, und der dauerhafte Notausgang, falls ein Anmeldeverfahren
 *   wegbricht.
 *
 * Die `userId` wird bewusst **nicht** gegen eine Liste bestehender Konten geprüft: Ein
 * Konto ohne Identität ist im KV nicht von einem Tippfehler zu unterscheiden, und
 * genau so legt der Operator ein Konto mit sprechendem Namen an — er stellt einen Code
 * darauf aus, und das Konto entsteht beim Einlösen. Was geprüft wird, ist die Form:
 * kein `:`, weil das Token-Format des OAuth-Providers `userId:grantId:secret` ist.
 *
 * Der Operator-Guard liegt in server/middleware/admin.ts.
 */
const KOERPER = z.object({
  userId: z
    .string()
    .trim()
    .max(64)
    .regex(/^[^:\s]*$/, 'Eine userId darf weder ":" noch Leerzeichen enthalten')
    .optional(),
})

export default defineEventHandler(async (event) => {
  const eingabe = KOERPER.safeParse(await readBody(event))
  if (!eingabe.success) {
    throw createError({
      statusCode: 400,
      statusMessage: eingabe.error.issues[0]?.message ?? 'Ungültige Eingabe',
    })
  }

  return createInvite(envOf(event).SESSION_KV, eingabe.data.userId || undefined)
})
