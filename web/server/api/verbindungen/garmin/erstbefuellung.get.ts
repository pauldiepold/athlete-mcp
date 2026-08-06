import { leseErstbefuellung } from '@shared/garmin/koerperdatenErstbefuellung'
import { istVerbunden } from '@shared/verbindungen'

/**
 * Der beobachtbare Zustand der **Erstbefüllung** (Issue #48) — damit die Oberfläche
 * „lädt gerade" von „verbunden, aber leer" unterscheiden kann.
 *
 * Ohne diese Unterscheidung sähe ein Dashboard, dessen Daten gerade geholt werden,
 * genauso aus wie eines, dessen Abruf gescheitert ist — und der Athlet drückte den
 * Knopf ein zweites Mal, mitten in einen laufenden Abruf gegen ein ratelimitetes
 * Garmin hinein.
 *
 * `lauf: null` heißt „es lief noch nie einer" — bei einem Konto ohne Garmin-Verbindung
 * ist das der Normalfall und kein Fehler; `verbunden` sagt, welcher der beiden Fälle
 * vorliegt. Was zurückkommt, sind Zahlen und Zeitstempel: Die Ansage an den Athleten
 * steht im Fehler-Marker der Verbindung, nicht hier.
 */
export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)

  return {
    verbunden: await istVerbunden(env.SESSION_KV, userId, 'garmin'),
    lauf: await leseErstbefuellung(env.SESSION_KV, userId),
  }
})
