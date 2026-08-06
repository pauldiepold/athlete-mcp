import { KoerperdatenArchive } from '@shared/garmin/koerperdatenArchive'
import { leseErstbefuellung } from '@shared/garmin/koerperdatenErstbefuellung'
import { istVerbunden } from '@shared/verbindungen'

/**
 * Woran die Startseite entscheidet, was sie zeigt (Issue #51): die drei Eingaben von
 * `startseitenZustand` in einer Antwort.
 *
 * Ein eigener Endpunkt neben den Serien, weil die Frage eine andere ist: Die Serien
 * gelten für einen **Zeitraum** — eine leere Woche im Umschalter hieße dort „keine
 * Daten", obwohl das Archiv voll ist. Ob überhaupt je etwas ankam, beantwortet nur der
 * früheste archivierte Tag, und der ist zeitraumunabhängig.
 *
 * Drei Zustände statt zweier Abrufe (Verbindungen + Erstbefüllung), weil die Seite sie
 * gemeinsam auswertet: Aus zwei Antworten, die Sekunden auseinanderliegen, entstünde
 * für einen Wimpernschlag der Zustand „verbunden, keine Daten, kein Lauf" — und genau
 * der zeigt den Knopf, den es während eines Laufs nicht geben darf.
 *
 * Bewusst nur Fakten: Welcher Hinweis daraus folgt, entscheidet `startseitenZustand`.
 */
export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)
  const archiv = new KoerperdatenArchive(env.ATHLETE_DB)

  return {
    garminVerbunden: await istVerbunden(env.SESSION_KV, userId, 'garmin'),
    hatKoerperdaten: (await archiv.firstDate(userId)) !== null,
    lauf: await leseErstbefuellung(env.SESSION_KV, userId),
  }
})
