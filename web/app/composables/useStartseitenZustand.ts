import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'
import {
  abfrageIntervallMs,
  startseitenZustand,
  zeigtVerlaeufe as berechneZeigtVerlaeufe,
} from '#shared/startseitenZustand'

/**
 * Der Zustand der Startseite (Issue #51): der Abruf, die reine Auswertung darüber und
 * das Nachfragen, das die Seite von selbst weiterspringen lässt.
 *
 * **Warum nachgefragt wird:** Alle drei datenlosen Zustände enden durch etwas, das
 * anderswo passiert — der Hintergrundlauf, ein zweiter Tab, der nächtliche Cron. Ohne
 * Nachfragen bliebe der Athlet vor einem Hinweis sitzen, der längst nicht mehr stimmt,
 * und lüde die Seite neu, um es herauszufinden.
 *
 * Genau **ein** Aufrufer montiert dieses Composable (`AthletDashboard`), sonst liefen
 * mehrere Timer auf denselben `useFetch`-Key. Was die Karten darunter auslösen, geben
 * sie als Ereignis nach oben — hier steht der einzige Abfrage-Takt.
 */
export function useStartseitenZustand() {
  const { loggedIn } = useUserSession()

  const { data, refresh, status } = useFetch('/api/koerperdaten/stand', {
    key: 'koerperdaten-stand',
    // Abgemeldet gibt es nichts zu holen — wie bei den Verbindungen käme nur ein 401
    // zurück, den in der Anmelde-Hälfte der Startseite niemand sehen soll.
    immediate: loggedIn.value,
    default: () => ({
      garminVerbunden: false,
      hatKoerperdaten: false,
      lauf: null as ErstbefuellungLauf | null,
    }),
  })

  // Derselbe geteilte Abruf, den auch der Verbindungs-Hinweis liest. Er hängt hier mit
  // drin, weil er im Zustand „nicht verbunden" der **Inhalt** der Seite ist: Sein
  // Ladezustand gehört damit zu dem der Seite, und sein Nachfrage-Takt ist dieser hier.
  const { refresh: verbindungenNeu, status: verbindungenStatus } = useVerbindungen()

  const hatKoerperdaten = computed(() => data.value?.hatKoerperdaten ?? false)
  const lauf = computed(() => data.value?.lauf ?? null)

  const zustand = computed(() =>
    startseitenZustand({
      garminVerbunden: data.value?.garminVerbunden ?? false,
      hatKoerperdaten: hatKoerperdaten.value,
      lauf: lauf.value,
    }),
  )

  const zeigtVerlaeufe = computed(() =>
    berechneZeigtVerlaeufe(zustand.value, hatKoerperdaten.value),
  )

  /**
   * Solange der **erste** Abruf läuft, ist noch nichts entschieden: `zustand` stünde
   * auf dem Default „nicht verbunden", und die Seite zeigte für einen Moment einen
   * Einrichtungs-Hinweis an ein längst eingerichtetes Konto.
   *
   * Beide Abrufe zählen dazu. Der Zustand „nicht verbunden" hat keinen eigenen Text —
   * er *ist* der Verbindungs-Hinweis; wäre der noch unterwegs, stünde unter der
   * Kopfzeile eine leere Seite ohne jede Handlung.
   *
   * Einmal wahr, bleibt es wahr: An `status` allein hinge es nicht, denn jedes
   * Nachfragen setzt ihn zurück auf `pending` und ließe die Seite im Takt des Timers
   * leer blinken.
   */
  const geladen = ref(false)
  watch(
    [status, verbindungenStatus],
    ([a, b]) => {
      const fertig = (s: string) => s === 'success' || s === 'error'
      if (fertig(a) && fertig(b)) geladen.value = true
    },
    { immediate: true },
  )

  /**
   * Den gerade angestoßenen Lauf übernehmen, ohne neu zu fragen. Der Zustand liegt im
   * KV und ist *eventually consistent*: Ein Abruf unmittelbar nach dem Anstoßen sähe
   * die Reservierung womöglich noch nicht — die Seite fiele auf „keine Daten" zurück
   * und böte den Knopf ein zweites Mal an. Der Timer holt den Rest von selbst nach.
   */
  function uebernimmLauf(neu: ErstbefuellungLauf | null) {
    if (data.value) data.value = { ...data.value, lauf: neu }
  }

  /**
   * Bei jedem Zustandswechsel ziehen die beiden anderen Flächen nach.
   *
   * Ohne das wäre der Wechsel nur halb: Die Verläufe holen ihre Serien beim Montieren,
   * und weil sie den Übergang `laeuft → daten` **montiert** erleben, zeigten sie danach
   * weiter die drei Tage von vorhin, bis jemand neu lädt. Genauso der
   * Verbindungs-Hinweis — wer im zweiten Tab verbindet, sähe sonst „Garmin ist noch
   * nicht verbunden" über einer Karte, die gerade Körperdaten holt.
   *
   * Am Wechsel und nicht an jedem Nachfragen: Während des Laufs jede zehn Sekunden alle
   * Serien und Wochen neu zu rechnen, kostet mehr als es zeigt — die Tage kommen
   * sequentiell, und am Ende steht ohnehin ein Wechsel.
   */
  watch(zustand, () => {
    verbindungenNeu()
    refreshNuxtData(['koerperdaten-serien', 'koerperdaten-wochen'])
  })

  let timer: ReturnType<typeof setInterval> | undefined
  watch(
    () => abfrageIntervallMs(zustand.value),
    (ms) => {
      clearInterval(timer)
      if (ms !== null) timer = setInterval(() => refresh(), ms)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => clearInterval(timer))

  return { zustand, lauf, hatKoerperdaten, zeigtVerlaeufe, geladen, uebernimmLauf }
}
