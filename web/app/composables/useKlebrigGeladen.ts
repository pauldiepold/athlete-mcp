import type { AsyncDataRequestStatus } from '#app'

/**
 * Sind diese Abrufe **einmal** durchgelaufen? Einmal wahr, bleibt es wahr.
 *
 * Zwei Flächen brauchen genau das (Startseite und Einrichtung), und beide aus
 * demselben Grund: Vor der ersten Antwort steht jeder abgeleitete Zustand auf seinem
 * Default — „nicht verbunden", „alles fehlt" —, und ein Hinweis auf Verdacht ist in
 * der Mehrzahl der Fälle der falsche.
 *
 * Der Latch ist der eigentliche Punkt: An `status` allein hinge es nicht, denn jedes
 * Nachfragen setzt ihn zurück auf `pending` und ließe die Fläche im Takt des Timers
 * leer blinken. Ein `error` zählt mit als durchgelaufen — die Antwort ist dann eben,
 * dass nichts kam, und darauf darf die Fläche entscheiden.
 */
export function useKlebrigGeladen(
  ...stati: Ref<AsyncDataRequestStatus>[]
): Ref<boolean> {
  const geladen = ref(false)

  watch(
    stati,
    (aktuelle) => {
      if (aktuelle.every(s => s === 'success' || s === 'error')) geladen.value = true
    },
    { immediate: true },
  )

  return geladen
}
