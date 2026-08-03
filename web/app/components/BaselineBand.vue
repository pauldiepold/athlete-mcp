<script setup lang="ts">
// Die Position eines Werts im eigenen Baseline-Band (Issue #25) — der Zusatz auf der
// HRV-Kachel. Ein HRV-Wert sagt für sich genommen nichts; erst der Abstand zum
// eigenen Korridor macht ihn lesbar, und genau den zeigt dieser Streifen.
//
// Wie die Mini-Kurve reines Inline-SVG, serverseitig gerendert, ohne Client-JS.
const props = defineProps<{
  wert: number | null
  unten: number | null
  oben: number | null
}>()

const BREITE = 100

/**
 * Der gezeigte Ausschnitt: das Band plus etwas Luft — und immer weit genug, dass
 * ein Wert außerhalb des Bands sichtbar bleibt statt am Rand zu kleben. Genau der
 * Fall, für den man hinschaut.
 */
const skala = computed(() => {
  const { wert, unten, oben } = props
  if (unten === null || oben === null) return null

  const lo = Math.min(unten, wert ?? unten)
  const hi = Math.max(oben, wert ?? oben)
  const luft = Math.max((hi - lo) * 0.2, 1)
  return { von: lo - luft, bis: hi + luft }
})

/** Ein Wert als x-Position im Ausschnitt. */
function x(wert: number): number {
  const { von, bis } = skala.value!
  const anteil = (wert - von) / (bis - von)
  return Math.round(anteil * BREITE * 100) / 100
}

const bandLinks = computed(() => (skala.value ? x(props.unten!) : 0))
const bandBreite = computed(() => (skala.value ? x(props.oben!) - bandLinks.value : 0))
const markerLinks = computed(() =>
  skala.value && props.wert !== null ? x(props.wert) : null,
)
</script>

<template>
  <div v-if="skala" class="space-y-0.5">
    <svg
      class="h-3 w-full"
      :viewBox="`0 0 ${BREITE} 12`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <!-- Der Ausschnitt als blasse Schiene, das Band darin kräftiger: die Klassen
           bedienen sich aus derselben Nuxt-UI-Palette wie die Charts, damit
           Hell/Dunkel auch hier ohne Sonderweg funktioniert. -->
      <rect x="0" y="4.5" :width="BREITE" height="3" rx="1.5" class="fill-primary/10" />
      <rect
        :x="bandLinks"
        y="4.5"
        :width="bandBreite"
        height="3"
        rx="1.5"
        class="fill-primary/30"
      />
      <rect
        v-if="markerLinks !== null"
        :x="Math.min(Math.max(markerLinks - 0.9, 0), BREITE - 1.8)"
        y="1"
        width="1.8"
        height="10"
        rx="0.9"
        class="fill-primary"
      />
    </svg>
    <p class="text-[10px] text-dimmed tabular-nums">Band {{ unten }}–{{ oben }} ms</p>
  </div>
</template>
