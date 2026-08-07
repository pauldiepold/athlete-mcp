<script setup lang="ts">
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'

// Verbunden, aber leer und es läuft nichts (Issue #51) — der einzige der drei
// datenlosen Zustände der Startseite, in dem der Athlet hier etwas tun kann.
//
// Derselbe Mechanismus wie beim Verbinden (die *Erstbefüllung* aus Issue #48), nicht
// ein zweiter, nachgebauter Pfad: Ein Hintergrundlauf hat keine Zustellgarantie, und
// dieser Knopf ist sein regulärer zweiter Versuch. Deshalb steht er hier — und nicht
// nur in den Einstellungen, wo ihn niemand sucht, der auf ein leeres Dashboard schaut.
//
// Was danach passiert, entscheidet die Startseite: Sie übernimmt den Lauf und wechselt
// auf den Ladehinweis. Diese Karte kennt den laufenden Lauf gar nicht — sie ist dann
// schon nicht mehr da.
const props = defineProps<{
  /** Der letzte Lauf, wenn es einen gab — er erklärt, warum trotzdem nichts da ist. */
  lauf: ErstbefuellungLauf | null
}>()

const emit = defineEmits<{ gestartet: [lauf: ErstbefuellungLauf | null] }>()

const { laeuftAn, fehler, starten } = useErstbefuellungStart()

const text = computed(() => {
  const l = props.lauf
  if (!l) {
    return 'Garmin ist verbunden, aber deine Körperdaten sind noch nicht geholt worden. '
      + 'Wir holen die letzten 30 Tage — danach steht hier dein Verlauf.'
  }
  if (l.status === 'gescheitert') {
    return 'Der Abruf deiner Körperdaten ist gescheitert. Ein zweiter Versuch holt sie '
      + 'nach; hält es an, stimmt vermutlich die Garmin-Verbindung nicht mehr.'
  }
  // Durchgelaufen und trotzdem nichts im Archiv: Garmin hatte für diese Tage nichts.
  // Das als Fehler zu melden wäre falsch — es ist ein Ergebnis.
  return 'Für die letzten 30 Tage hat Garmin nichts geliefert. Wenn deine Uhr seitdem '
    + 'synchronisiert hat, lohnt ein neuer Versuch.'
})

const knopf = computed(() => (props.lauf ? 'Noch einmal holen' : 'Körperdaten holen'))

async function holen() {
  const neuerLauf = await starten()
  // Nur ein geglückter Anstoß wechselt den Zustand. Nach einem Fehlschlag bleibt die
  // Karte stehen und zeigt statt ihres Textes die Meldung — dort, wo der Athlet gerade
  // hingedrückt hat.
  if (!fehler.value) emit('gestartet', neuerLauf)
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">Noch keine Körperdaten</h2>
    </template>

    <p class="text-sm text-muted">{{ fehler ?? text }}</p>

    <UButton class="mt-4" :loading="laeuftAn" @click="holen">{{ knopf }}</UButton>
  </UCard>
</template>
