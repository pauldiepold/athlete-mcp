import { KoerperdatenArchive } from '@shared/garmin/koerperdatenArchive'
import {
  leseErstbefuellung,
  offeneErstbefuellungsTage,
} from '@shared/garmin/koerperdatenErstbefuellung'
import { istVerbunden } from '@shared/verbindungen'
import { heuteInBerlin } from '@shared/zeitzone'

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
 *
 * **Dazu die offenen Tage**, und zwar aus demselben Blick ins Archiv, den auch das
 * Anstoßen macht (`offeneErstbefuellungsTage`). Der Lauf allein beschreibt die Daten
 * nicht: Wessen Archiv der nächtliche Cron gefüllt hat, hat nie einen Lauf gehabt, und
 * die Oberfläche behauptete darüber „noch nicht geholt". Weil dieselbe Zahl entscheidet,
 * ob `POST` überhaupt etwas anstößt, sagen Knopf und Route so dasselbe. `null` heißt
 * „nicht feststellbar": Ein unlesbares Archiv ist keine Aussage über die Daten, und
 * der Zustand des Laufs steht ja trotzdem daneben.
 */
export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)

  const verbunden = await istVerbunden(env.SESSION_KV, userId, 'garmin')

  let offen: number | null = null
  if (verbunden) {
    try {
      const archiv = new KoerperdatenArchive(env.ATHLETE_DB)
      offen = (await offeneErstbefuellungsTage(archiv, userId, heuteInBerlin())).length
    } catch (err) {
      console.error(`Erstbefüllung ${userId}: Archiv nicht lesbar:`, err)
    }
  }

  return {
    verbunden,
    lauf: await leseErstbefuellung(env.SESSION_KV, userId),
    offen,
  }
})
