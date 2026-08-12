import type { Taktwunsch } from '#shared/erstbefuellung'
import {
  abfrageIntervallMs,
  startseitenZustand,
  zeigtKoerperdaten as berechneZeigtKoerperdaten,
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
 * Genau **ein** Aufrufer montiert dieses Composable (`AthletStartseite`). Was die Karten
 * darunter auslösen, gehört inzwischen ihnen selbst — die Erstbefüllung hat ein eigenes
 * Modul, das den Lauf für alle Flächen hält.
 *
 * Und dort liegt auch das **Intervall**: Die Seite sagt nur, wie oft sie es gern hätte.
 * Ihr eigener Timer ging genau dann daneben, wo die Erstbefüllung ohnehin sichtbar ist —
 * bei offener Einrichtung steht die Einrichtungs-Karte mitsamt dem Erstbefüllungs-Knopf
 * auf dieser Seite, und während eines Laufs fragten beide im Zehnsekundentakt denselben
 * Abruf ab.
 */
export function useStartseitenZustand() {
  /**
   * Wie oft die Seite nachgefragt haben will — ein Ref, das erst weiter unten gefüllt
   * wird, denn der Wunsch hängt am `zustand`, und der wiederum am Stand von hier.
   *
   * Ausgesprochen wird der Wunsch, aufgezogen wird er nicht: Das Intervall auf den Stand
   * gehört dem Erstbefüllungs-Modul, das die Wünsche aller Beobachter zu **einem**
   * zusammenrechnet. Die Seite hatte hier lange ihren eigenen Timer, und weil die
   * Einrichtungs-Karte mitsamt dem Erstbefüllungs-Knopf bei offener Einrichtung auf
   * derselben Seite steht, liefen während eines Laufs zwei Intervalle auf denselben
   * Abruf.
   */
  const taktwunsch = ref<Taktwunsch>(null)

  /**
   * Der Stand kommt aus dem Erstbefüllungs-Modul: derselbe Abruf, dieselbe Antwort, ein
   * Lauf. Was die Seite über den Stand hinaus nachzieht, hängt hier mit dran — es soll
   * in **ihrem** Takt geschehen und nicht in einem zweiten.
   *
   * Die *Verbindungen* sind derselbe geteilte Abruf, den auch der Verbindungs-Hinweis
   * liest: Er hängt hier mit drin, weil er im Zustand „nicht verbunden" der **Inhalt**
   * der Seite ist. Und die *Einrichtung* (Issue #52) steht seit Issue #57 **über** dem
   * Dashboard statt an seiner Stelle; ihre beiden Pflichtschritte werden **außerhalb**
   * dieser Fläche erledigt — im Connector-Dialog und im Chat —, sonst säße der Athlet
   * vor einer Liste, die er gerade abgearbeitet hat.
   */
  const { refresh: verbindungenNeu } = useVerbindungen()

  const {
    pflichtSchrittOffen,
    geladen: einrichtungGeladen,
    refresh: einrichtungNeu,
  } = useEinrichtung()

  const { stand: data, lauf, status } = useErstbefuellung({
    takt: taktwunsch,
    ziehtNach: () => {
      einrichtungNeu()
      verbindungenNeu()
    },
  })

  const hatKoerperdaten = computed(() => data.value?.hatKoerperdaten ?? false)

  const zustand = computed(() =>
    startseitenZustand({
      garminVerbunden: data.value?.garminVerbunden ?? false,
      hatKoerperdaten: hatKoerperdaten.value,
      lauf: lauf.value,
    }),
  )

  const zeigtKoerperdaten = computed(() =>
    berechneZeigtKoerperdaten(zustand.value, hatKoerperdaten.value),
  )

  /**
   * Solange der **erste** Abruf läuft, ist noch nichts entschieden: `zustand` stünde
   * auf dem Default „nicht verbunden", und die Seite zeigte für einen Moment einen
   * Einrichtungs-Hinweis an ein längst eingerichtetes Konto.
   *
   * Alle Abrufe zählen dazu. Der Zustand „nicht verbunden" hat keinen eigenen Text —
   * er *ist* der Verbindungs-Hinweis; wäre der noch unterwegs, stünde unter der
   * Kopfzeile eine leere Seite ohne jede Handlung. Und die Einrichtung stünde vor
   * ihrer ersten Antwort auf ihrem Default „alles fehlt" — sie blitzte auch für den
   * auf, der längst fertig ist.
   *
   * Einmal wahr, bleibt es wahr (`useKlebrigGeladen`): An `status` allein hinge es
   * nicht, denn jedes Nachfragen setzt ihn zurück auf `pending` und ließe die Seite im
   * Takt des Timers leer blinken.
   */
  const standGeladen = useKlebrigGeladen(status)
  const geladen = computed(() => standGeladen.value && einrichtungGeladen.value)

  /**
   * Bei jedem Zustandswechsel ziehen die beiden anderen Flächen nach.
   *
   * Ohne das wäre der Wechsel nur halb: Die Kachelzeile holt ihre Serien beim
   * Montieren, und weil sie den Übergang `laeuft → daten` **montiert** erlebt, zeigte
   * sie danach weiter die drei Tage von vorhin, bis jemand neu lädt. Genauso der
   * Verbindungs-Hinweis — wer im zweiten Tab verbindet, sähe sonst „Garmin ist noch
   * nicht verbunden" über einer Karte, die gerade Körperdaten holt.
   *
   * Die Keys der Verläufe stehen mit in der Liste, obwohl sie seit Issue #60 auf einer
   * anderen Seite liegen: Ihre Nuxt-Daten überleben den Seitenwechsel, und ein Athlet,
   * der während der Erstbefüllung auf `/dashboard` wechselt, bekäme sonst den Stand von
   * vor dem Lauf serviert.
   *
   * Am Wechsel und nicht an jedem Nachfragen: Während des Laufs jede zehn Sekunden alle
   * Serien und Wochen neu zu rechnen, kostet mehr als es zeigt — die Tage kommen
   * sequentiell, und am Ende steht ohnehin ein Wechsel.
   */
  watch(zustand, () => {
    verbindungenNeu()
    refreshNuxtData([
      'koerperdaten-serien-start',
      'koerperdaten-serien',
      'koerperdaten-wochen',
    ])
  })

  /**
   * Der Wunsch der Seite, wie oft nachgefragt wird — eng während eines Laufs, ruhiger in
   * den wartenden Zuständen, gar nicht im eingeschwungenen Fall (`abfrageIntervallMs`).
   *
   * Zwei Gründe zählen einzeln (Issue #57): der Zustand der Körperdaten **und** die
   * offene Einrichtung. Der zweite steht ausdrücklich daneben, seit die Einrichtung kein
   * Zustand mehr ist — sonst hörte ausgerechnet das Konto mit Verläufen und offenem
   * Connector auf zu fragen, also genau das, für das der Haken gleich von außen gesetzt
   * wird.
   *
   * Ein `watchEffect` und kein Startwert: Der Wunsch ändert sich mit dem Zustand, und
   * das Modul zieht daraufhin von selbst den passenden Takt auf oder ab.
   */
  watchEffect(() => {
    taktwunsch.value = abfrageIntervallMs(zustand.value, pflichtSchrittOffen.value)
  })

  return {
    zustand,
    hatKoerperdaten,
    zeigtKoerperdaten,
    /** Die zweite Achse (Issue #57): Steht die Einrichtung über dem Dashboard? */
    einrichtungOffen: pflichtSchrittOffen,
    geladen,
  }
}
