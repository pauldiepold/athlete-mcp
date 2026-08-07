import type { Verbindung } from '@shared/verbindungen'

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

  return { verbindungen, offen, refresh, status }
}
