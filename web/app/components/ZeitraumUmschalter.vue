<script setup lang="ts">
import type { ZeitraumName } from '#shared/zeitraum'

// Der Zeitraum-Umschalter des Dashboards (Issue #25). Er steuert **einen** Wert —
// den Ausschnitt des Bereichs-Endpunkts — und damit alle Charts und Kacheln
// gemeinsam; es gibt keinen Chart mit eigenem Zeitraum.
//
// Vier Wahlmöglichkeiten in einer Reihe: die drei gleitenden Fenster (30/90/Alles) als
// Knöpfe, dazu eine einzelne Kalenderwoche als Auswahlliste. Die Woche gehört hierher
// und nicht nur in die Wochenliste am Seitenende: sie ist derselbe Wert, nur anders
// gewählt, und wer von „30 Tage" auf „W31" will, soll dafür nicht erst ans Ende der
// Seite scrollen müssen. Als Liste statt als weiterer Knopf, weil es Dutzende Wochen
// gibt — und weil sie damit zugleich anzeigt, welche gerade gewählt ist.
//
// Die Wahl steht in der URL statt in einem lokalen Ref: so überlebt sie einen Reload,
// ist teilbar, und die Seite wird serverseitig direkt mit dem richtigen Ausschnitt
// gerendert. Eine gewählte Woche (`?kw=…`) ersetzt den benannten Ausschnitt
// vollständig — dann ist keiner der drei Knöpfe aktiv, und ein Klick auf einen von
// ihnen ersetzt die Query samt Woche wieder.
const props = defineProps<{
  zeitraum: ZeitraumName
  /** Die gewählte Kalenderwoche, wenn eine gewählt ist — sonst `null`. */
  kw: string | null
  /** Die auswählbaren Wochen (`YYYY-Www`), so wie sie die Wochenliste kennt. */
  wochen: string[]
}>()

const AUSWAHL: { wert: ZeitraumName, label: string }[] = [
  { wert: '30', label: '30 Tage' },
  { wert: '90', label: '90 Tage' },
  { wert: 'alles', label: 'Alles' },
]

const route = useRoute()

// Neueste zuerst — wie in der Wochenliste: gesucht wird fast immer eine der letzten
// Wochen, nicht eine vom Anfang des Archivs.
const wochenAbsteigend = computed(() => [...props.wochen].sort((a, b) => b.localeCompare(a)))

function waehleWoche(kw: string | undefined) {
  if (kw) navigateTo({ path: route.path, query: { kw } })
}
</script>

<template>
  <div class="flex items-center gap-1">
    <UButton
      v-for="eintrag in AUSWAHL"
      :key="eintrag.wert"
      :to="{ path: route.path, query: { zeitraum: eintrag.wert } }"
      :color="kw === null && zeitraum === eintrag.wert ? 'primary' : 'neutral'"
      :variant="kw === null && zeitraum === eintrag.wert ? 'soft' : 'ghost'"
      size="xs"
    >{{ eintrag.label }}</UButton>

    <USelectMenu
      v-if="wochenAbsteigend.length"
      :model-value="kw ?? undefined"
      :items="wochenAbsteigend"
      :color="kw === null ? 'neutral' : 'primary'"
      :variant="kw === null ? 'ghost' : 'soft'"
      size="xs"
      class="ml-1 w-32"
      icon="i-lucide-calendar-days"
      placeholder="Woche"
      :search-input="{ placeholder: 'Woche suchen…' }"
      @update:model-value="waehleWoche"
    />
  </div>
</template>
