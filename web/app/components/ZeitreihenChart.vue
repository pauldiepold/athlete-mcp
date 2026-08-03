<script setup lang="ts">
import type { Farbname } from '~/composables/useChartFarben'

// Gemeinsamer Chart-Wrapper der Körperdaten-Verläufe (Issue #24). Er trägt das
// Drumherum, das jeder Verlauf gleich haben soll: Karte mit Titel, feste Höhe (kein
// Sprung beim Hydrieren), Leer-Zustand — und die Grenze zum Client. Achsen, Zeitskala,
// Lückenverhalten und Farben liegen eine Ebene tiefer im Canvas.
//
// Serverseitig wird nur das Gerüst gerendert: Chart.js braucht ein echtes <canvas>
// und läuft deshalb ausschließlich im Browser.
const props = defineProps<{
  titel: string
  /** Die x-Achse: jeder Kalendertag des Zeitraums als YYYY-MM-DD. */
  tage: string[]
  /** Eine Linie je Serie; `null` in den Werten ist eine Lücke und bleibt eine. */
  linien: { label: string; werte: (number | null)[]; farbe?: Farbname }[]
  /** Optionale Fläche zwischen zwei Grenzserien (z. B. das Baseline-Band). */
  band?: { label: string; unten: (number | null)[]; oben: (number | null)[] }
  /** Einheit für die Tooltips, z. B. „ms". */
  einheit?: string
}>()

// Kein einziger Messwert im Zeitraum → gar keinen Chart zeigen. Eine leere Achse
// mit Gitternetz sieht nach Defekt aus; der Satz sagt, was tatsächlich los ist.
const hatWerte = computed(() =>
  [
    ...props.linien.map((l) => l.werte),
    ...(props.band ? [props.band.unten, props.band.oben] : []),
  ].some((werte) => werte.some((w) => w !== null)),
)
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-medium">{{ titel }}</h2>
    </template>

    <div class="h-72">
      <p v-if="!hatWerte" class="flex h-full items-center justify-center text-sm text-muted">
        Keine Werte im Zeitraum.
      </p>
      <ClientOnly v-else>
        <ZeitreihenChartCanvas
          :tage="tage"
          :linien="linien"
          :band="band"
          :einheit="einheit"
        />
        <template #fallback>
          <div class="h-full animate-pulse rounded bg-elevated" />
        </template>
      </ClientOnly>
    </div>
  </UCard>
</template>
