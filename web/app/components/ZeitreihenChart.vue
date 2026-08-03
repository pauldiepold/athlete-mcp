<script setup lang="ts">
import type { Band, Reihe } from '~/types/zeitreihe'

// Gemeinsamer Chart-Wrapper der Körperdaten-Verläufe (Issue #24, erweitert in #25).
// Er trägt das Drumherum, das jeder Verlauf gleich haben soll: Karte mit Titel,
// feste Höhe (kein Sprung beim Hydrieren), Leer-Zustand — und die Grenze zum Client.
// Achsen, Zeitskala, Stapel, Lückenverhalten und Farben liegen eine Ebene tiefer im
// Canvas.
//
// Alle Verläufe gehen durch diesen Wrapper, auch Balken und Flächen: was ein Chart
// zusätzlich können muss, wird hier ergänzt statt daran vorbei gebaut. Die Seite
// beschreibt nur Reihen (~/types/zeitreihe) und weiß von Chart.js nichts.
//
// Serverseitig wird nur das Gerüst gerendert: Chart.js braucht ein echtes <canvas>
// und läuft deshalb ausschließlich im Browser.
const props = defineProps<{
  titel: string
  /** Die x-Achse: jeder Kalendertag des Zeitraums als YYYY-MM-DD. */
  tage: string[]
  /** Was gezeichnet wird — Linien, Flächen, Balken, in dieser Malreihenfolge. */
  reihen: Reihe[]
  /** Optionale Fläche zwischen zwei Grenzserien (z. B. das Baseline-Band). */
  band?: Band
  /** Einheit der linken Achse für die Tooltips, z. B. „ms". */
  einheit?: string
  /** Einheit der rechten Achse, wenn eine Reihe dort liegt. */
  einheitRechts?: string
}>()

// Kein einziger Messwert im Zeitraum → gar keinen Chart zeigen. Eine leere Achse
// mit Gitternetz sieht nach Defekt aus; der Satz sagt, was tatsächlich los ist.
const hatWerte = computed(() =>
  [
    ...props.reihen.map(r => r.werte),
    ...(props.band ? [props.band.unten, props.band.oben] : []),
  ].some(werte => werte.some(w => w !== null)),
)
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-4' }">
    <template #header>
      <h2 class="text-sm font-medium sm:text-base">{{ titel }}</h2>
    </template>

    <!-- Höhe fest, Breite folgt dem Container: der Chart kann auf keiner Breite
         über den Rand hinauslaufen. -->
    <div class="h-56 w-full sm:h-72">
      <p v-if="!hatWerte" class="flex h-full items-center justify-center text-sm text-muted">
        Keine Werte im Zeitraum.
      </p>
      <ClientOnly v-else>
        <ZeitreihenChartCanvas
          :tage="tage"
          :reihen="reihen"
          :band="band"
          :einheit="einheit"
          :einheit-rechts="einheitRechts"
        />
        <template #fallback>
          <div class="h-full animate-pulse rounded bg-elevated" />
        </template>
      </ClientOnly>
    </div>
  </UCard>
</template>
