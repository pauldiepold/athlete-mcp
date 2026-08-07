import { getProfil, setProfil } from '@shared/identitaet'
import { z } from 'zod'

/**
 * Ändert den Anzeigenamen des angemeldeten Athleten.
 *
 * Der Provider liefert den Namen nur als **Vorbelegung** beim Einlösen des
 * Invite-Codes — ein Tippfehler oder ein ungewollter Klarname darf danach nicht
 * dauerhaft oben in der Kopfzeile stehen. Leer ist ausdrücklich erlaubt: Die
 * Kopfzeile fällt dann auf ein neutrales Wort zurück, was besser ist, als jemanden
 * zu einem Namen zu zwingen.
 *
 * Nur der Anzeigename ist änderbar. Verfahren und `sub` sind die Identität — die
 * wechselt über einen Invite-Code, nicht über ein Formular; die E-Mail-Adresse kommt
 * bei jedem Login frisch vom Provider.
 *
 * Die Fläche dazu (`/einstellungen`) entsteht in Issue #44; hier steht die Fähigkeit.
 */
const KOERPER = z.object({
  anzeigename: z.string().trim().max(80),
})

export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)

  const eingabe = KOERPER.safeParse(await readBody(event))
  if (!eingabe.success) {
    throw createError({ statusCode: 400, statusMessage: 'Ungültiger Anzeigename' })
  }

  const profil = await getProfil(env.SESSION_KV, userId)
  if (!profil) {
    // Ohne Profil gibt es nichts zu ändern — und ein neues zu erfinden hieße,
    // Verfahren und `sub` zu raten.
    throw createError({ statusCode: 409, statusMessage: 'Kein Profil vorhanden' })
  }

  const neu = { ...profil, anzeigename: eingabe.data.anzeigename }
  await setProfil(env.SESSION_KV, userId, neu)

  // Die Session trägt den Namen fürs UI mit; ohne dieses Nachziehen zeigte die
  // Kopfzeile bis zum nächsten Login den alten. Die Operator-Rolle bleibt, wie sie
  // war — sie hängt an der Identität, nicht am Anzeigenamen.
  const { user } = await getUserSession(event)
  await setUserSession(event, {
    user: { ...user!, name: neu.anzeigename, email: neu.email },
  })

  return { anzeigename: neu.anzeigename }
})
