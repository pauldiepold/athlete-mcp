<script setup lang="ts">
import type { ZeitraumName } from '#shared/zeitraum'

// Der Zeitraum-Umschalter des Dashboards (Issue #25). Er steuert **einen** Wert —
// den Ausschnitt des Bereichs-Endpunkts — und damit alle Charts und Kacheln
// gemeinsam; es gibt keinen Chart mit eigenem Zeitraum.
//
// Die Wahl steht in der URL statt in einem lokalen Ref: so überlebt sie einen Reload,
// ist teilbar, und die Seite wird serverseitig direkt mit dem richtigen Ausschnitt
// gerendert.
//
// `null` steht für ein explizites `?von=…&bis=…` (Issue #28, der Rücksprung vom
// Körperdaten-Streifen der Steuerungs-Wochenseite): keiner der drei Knöpfe passt auf
// den Zeitraum genau einer Woche, also ist auch keiner aktiv — ein Klick auf einen der
// drei ersetzt ihn wieder durch einen benannten Ausschnitt.
defineProps<{ modelValue: ZeitraumName | null }>()

const AUSWAHL: { wert: ZeitraumName, label: string }[] = [
  { wert: '30', label: '30 Tage' },
  { wert: '90', label: '90 Tage' },
  { wert: 'alles', label: 'Alles' },
]

const route = useRoute()
</script>

<template>
  <div class="flex items-center gap-1">
    <UButton
      v-for="eintrag in AUSWAHL"
      :key="eintrag.wert"
      :to="{ path: route.path, query: { zeitraum: eintrag.wert } }"
      :color="modelValue === eintrag.wert ? 'primary' : 'neutral'"
      :variant="modelValue === eintrag.wert ? 'soft' : 'ghost'"
      size="xs"
    >{{ eintrag.label }}</UButton>
  </div>
</template>
