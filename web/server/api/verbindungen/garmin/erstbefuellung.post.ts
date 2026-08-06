import { istVerbunden } from '@shared/verbindungen'

/**
 * Die **Erstbefüllung** von Hand auslösen (Issue #48) — der Knopf des Athleten.
 *
 * Kein Reparatur-Sonderweg, sondern der reguläre zweite Versuch: Für einen
 * Hintergrundlauf gibt es keine Zustellgarantie, und bricht er ab, merkt es sonst
 * niemand. Derselbe Mechanismus wie nach dem Verbinden, angestoßen von derselben
 * Stelle — ein zweiter, nachgebauter Pfad würde beim nächsten Formatwechsel vergessen.
 *
 * Antwortet sofort und lässt den Lauf im Hintergrund weiterlaufen; den Fortschritt
 * liest die Oberfläche über `GET`. Läuft schon einer, passiert nichts — das entscheidet
 * die Reservierung im Garmin-Kontext, nicht diese Route.
 *
 * Ohne Garmin-Verbindung gibt es nichts zu holen: 400 statt eines Laufs, der bloß am
 * fehlenden Token scheitert und dabei den Fehler-Marker einer nie eingerichteten
 * Verbindung setzt.
 */
export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)

  if (!(await istVerbunden(env.SESSION_KV, userId, 'garmin'))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verbinde zuerst Garmin, dann können wir deine Körperdaten holen.',
    })
  }

  return { lauf: await starteErstbefuellungImHintergrund(event, userId, env) }
})
