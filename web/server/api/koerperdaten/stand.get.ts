import { KoerperdatenArchive } from '@shared/garmin/koerperdatenArchive'
import {
  leseErstbefuellung,
  offeneErstbefuellungsTage,
} from '@shared/garmin/koerperdatenErstbefuellung'
import { istVerbunden } from '@shared/verbindungen'
import { heuteInBerlin } from '@shared/zeitzone'

/**
 * Woran die Startseite entscheidet, was sie zeigt (Issue #51): die drei Eingaben von
 * `startseitenZustand` in einer Antwort — **und** der beobachtbare Zustand der
 * *Erstbefüllung* (Issue #48) dazu.
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
 * **Ein Abruf für den einen Lauf.** Bis zum Zusammenlegen gab es daneben ein
 * `GET /api/verbindungen/garmin/erstbefuellung` mit denselben Zahlen für dieselbe
 * Frage; auf der Startseite liefen beide gleichzeitig, jeder mit eigenem Takt. Es gibt
 * genau **einen** Lauf zu beobachten, also gibt es genau einen beobachtenden Abruf.
 * Das *Anstoßen* bleibt, wo es hingehört: `POST /api/verbindungen/garmin/erstbefuellung`
 * ist eine Handlung an der Verbindung, dieser Endpunkt eine Lesung der Körperdaten.
 *
 * `lauf: null` heißt „es lief noch nie einer" — bei einem Konto ohne Garmin-Verbindung
 * ist das der Normalfall und kein Fehler; `garminVerbunden` sagt, welcher der beiden
 * Fälle vorliegt. Was zurückkommt, sind Zahlen und Zeitstempel: Die Ansage an den
 * Athleten steht im Fehler-Marker der Verbindung, nicht hier.
 *
 * **Dazu die offenen Tage**, und zwar aus demselben Blick ins Archiv, den auch das
 * Anstoßen macht (`offeneErstbefuellungsTage`). Der Lauf allein beschreibt die Daten
 * nicht: Wessen Archiv der nächtliche Cron gefüllt hat, hat nie einen Lauf gehabt, und
 * die Oberfläche behauptete darüber „noch nicht geholt". Weil dieselbe Zahl entscheidet,
 * ob `POST` überhaupt etwas anstößt, sagen Knopf und Route so dasselbe. `null` heißt
 * „nicht feststellbar": Ein unlesbares Archiv ist keine Aussage über die Daten, und
 * der Zustand des Laufs steht ja trotzdem daneben.
 *
 * Bewusst nur Fakten: Welcher Hinweis daraus folgt, entscheiden `startseitenZustand`
 * und `erstbefuellungsFall`.
 */
export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)
  const archiv = new KoerperdatenArchive(env.ATHLETE_DB)

  const garminVerbunden = await istVerbunden(env.SESSION_KV, userId, 'garmin')

  // Ohne Verbindung gibt es nichts anzustoßen, und die Zahl trüge nichts bei — sie
  // wäre immer das volle Fenster.
  let offen: number | null = null
  if (garminVerbunden) {
    try {
      offen = (await offeneErstbefuellungsTage(archiv, userId, heuteInBerlin())).length
    } catch (err) {
      console.error(`Erstbefüllung ${userId}: Archiv nicht lesbar:`, err)
    }
  }

  return {
    garminVerbunden,
    hatKoerperdaten: (await archiv.firstDate(userId)) !== null,
    lauf: await leseErstbefuellung(env.SESSION_KV, userId),
    offen,
  }
})
