import type { Datenquelle } from '@shared/verbindungen'
import {
  einrichtungsSchritte,
  naechsterOffenerSchritt,
  offenePflichtSchritte,
  pflichtOffen,
} from '#shared/einrichtung'

/**
 * Der Zustand der **Einrichtung** (Issue #52) — aus zwei Abrufen zusammengesetzt und
 * von allen geteilt.
 *
 * Zwei Flächen fragen danach: die Startseite, an der Einrichtung und Dashboard
 * einander ablösen, und die Einstellungen, wo die Liste danach erreichbar bleibt. Wie
 * bei den Verbindungen ein gemeinsamer `useFetch`-Key statt zweier Abrufe.
 *
 * Die Verbindungen kommen aus `useVerbindungen` und nicht aus einem eigenen Feld der
 * Antwort: Sie sind derselbe Zustand, den der Verbindungs-Hinweis und die
 * Einstellungen-Karten zeigen, und zwei Quellen dafür widersprächen sich genau dann,
 * wenn der Athlet hinschaut.
 */
export function useEinrichtung() {
  const { loggedIn } = useUserSession()
  const { verbindungen, status: verbindungenStatus } = useVerbindungen()

  const { data, refresh, status } = useFetch('/api/einrichtung', {
    key: 'einrichtung',
    // Abgemeldet gibt es nichts zu holen — wie bei den Verbindungen käme nur ein 401.
    immediate: loggedIn.value,
    default: () => ({ connector: false, steuerungsplan: false, mcpUrl: '' }),
  })

  function zustandVon(quelle: Datenquelle) {
    return verbindungen.value.find(v => v.quelle === quelle)?.zustand ?? 'fehlt'
  }

  const schritte = computed(() =>
    einrichtungsSchritte({
      garmin: zustandVon('garmin'),
      finalsurge: zustandVon('finalsurge'),
      connector: data.value?.connector ?? false,
      steuerungsplan: data.value?.steuerungsplan ?? false,
    }),
  )

  /**
   * Fehlt noch ein **Pflicht**-Schritt? Daran hängt, was die Startseite zeigt.
   *
   * Der Name sagt „Pflicht" ausdrücklich mit, weil `useVerbindungen` ein `offen`
   * anderer Bedeutung führt (die Liste der offenen Verbindungen) und beide auf
   * derselben Fläche nebeneinander liegen.
   */
  const pflichtSchrittOffen = computed(() => pflichtOffen(schritte.value))

  /** Wie viele davon — die Zahl, die die Karte über dem Dashboard nennt (Issue #57). */
  const offenePflicht = computed(() => offenePflichtSchritte(schritte.value))

  /** Der Schritt, der auf der Startseite als einziger aufgeklappt steht. */
  const naechsterOffener = computed(() => naechsterOffenerSchritt(schritte.value))

  const mcpUrl = computed(() => data.value?.mcpUrl ?? '')

  /** Beide Abrufe sind durch — vorher steht die Liste auf ihrem Default „alles fehlt". */
  const geladen = useKlebrigGeladen(status, verbindungenStatus)

  return {
    schritte,
    pflichtSchrittOffen,
    offenePflicht,
    naechsterOffener,
    mcpUrl,
    geladen,
    refresh,
  }
}
