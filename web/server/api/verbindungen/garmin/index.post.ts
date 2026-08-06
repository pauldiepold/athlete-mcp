import { legeMfaZustandAb } from '@shared/garmin/garminMfaSpeicher'
import { starteGarminLogin } from '@shared/garmin/garminSsoLogin'
import { speichereGarmin } from '@shared/verbindungen'
import { z } from 'zod'

/**
 * Der erste von zwei Schritten des Garmin-Logins (Issue #44, belegt durch Spike #38):
 * Zugangsdaten entgegennehmen, den SSO-Widget-Flow starten.
 *
 * Zwei Ausgänge, weil der Ablauf an der Zwei-Faktor-Abfrage zerfällt:
 * - `fertig` — das DI-Bündel liegt im KV, die Verbindung steht.
 * - `mfa` — Garmin verlangt einen Code. Der Browser bekommt einen **opaken Handle**;
 *   der Zwischenzustand (Cookies, frisches CSRF) bleibt kurzlebig im KV und geht nie
 *   an den Client.
 *
 * **Die Zugangsdaten werden nirgends gespeichert** — Auflage aus Spike #38. Sie sind
 * Argumente dieses Requests und danach weg; gespeichert wird ausschließlich das
 * DI-Bündel.
 *
 * Der Pfad ist inoffiziell und wird brechen. Deshalb endet ein Fehlschlag in einer
 * verständlichen Meldung mit Wiederholmöglichkeit (400) statt in einem 500er.
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

  const start = await mitGarminFehler('Garmin-Login', () =>
    starteGarminLogin(eingabe.data.email, eingabe.data.password),
  )

  if (start.art === 'mfa') {
    const handle = await legeMfaZustandAb(env.SESSION_KV, userId, start.zustand)
    return { art: 'mfa' as const, handle }
  }

  await speichereGarmin(env.SESSION_KV, userId, start.anmeldung)

  // Ab hier steht die Verbindung — und das Dashboard wäre bis zum nächsten Cron-Lauf um
  // 5 Uhr leer. Die Erstbefüllung holt die letzten 30 Tage im Hintergrund nach
  // (Issue #48); die Antwort dieses Formulars wartet nicht darauf.
  await starteErstbefuellungImHintergrund(event, userId, env)

  return { art: 'fertig' as const }
})
