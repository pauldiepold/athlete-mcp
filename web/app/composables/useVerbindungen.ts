import type { Datenquelle, Verbindung } from '@shared/verbindungen'

/**
 * Der Verbindungs-Zustand, einmal geladen und von allen geteilt (Issue #44).
 *
 * Zwei Flächen fragen danach: der Hinweis oben auf dem Dashboard und die Karten in den
 * Einstellungen. Ein gemeinsamer `useFetch`-Key statt zweier Abrufe — sonst könnten
 * die beiden nach einem gerade abgeschlossenen Verbinden Verschiedenes behaupten, und
 * das ist genau der Moment, in dem der Athlet hinschaut.
 */
export function useVerbindungen() {
  const { loggedIn } = useUserSession()

  const { data, refresh, status } = useFetch('/api/verbindungen', {
    key: 'verbindungen',
    // Abgemeldet gibt es nichts zu holen; der Endpunkt käme mit 401 zurück und die
    // Startseite zeigte in ihrer Anmelde-Hälfte einen Fehler, der niemanden angeht.
    immediate: loggedIn.value,
    default: () => ({ verbindungen: [] as Verbindung[] }),
  })

  const verbindungen = computed(() => data.value?.verbindungen ?? [])

  /** Solange etwas fehlt oder kaputt ist, hat der Athlet etwas zu tun. */
  const offen = computed(() => verbindungen.value.filter(v => v.zustand !== 'verbunden'))

  /**
   * Eine **gerade hergestellte** Verbindung als verbunden übernehmen, statt sie zu
   * erfragen — dasselbe Vorgehen wie beim angestoßenen Erstbefüllungs-Lauf
   * (`uebernimmLauf`) und aus demselben Grund: Der Zustand liegt im KV und ist
   * *eventually consistent*.
   *
   * Wer gerade ein Passwort abgeschickt und eine Bestätigung bekommen hat, weiß es
   * besser als ein Abruf in derselben Sekunde. Ohne das stand der Schritt in der
   * Einrichtung nach einem geglückten Final-Surge-Verbinden bis zum Neuladen offen —
   * während im Schritt selbst schon „Verbunden" stand.
   *
   * **Nach** dem Nachziehen aufrufen, nicht davor: Sonst überschriebe die Antwort, auf
   * die gewartet wird, das Wissen mit dem, was der Index gerade noch behauptet.
   */
  function uebernimmVerbunden(quelle: Datenquelle) {
    if (!data.value) return
    data.value = {
      verbindungen: verbindungen.value.map(v =>
        v.quelle === quelle
          ? { ...v, zustand: 'verbunden' as const, meldung: null, seit: null }
          : v,
      ),
    }
  }

  return { verbindungen, offen, uebernimmVerbunden, refresh, status }
}
