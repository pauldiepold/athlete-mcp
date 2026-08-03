<script setup lang="ts">
import type { Kennzahl } from '@shared/garmin/koerperdatenSerien'

// Eine Kachel der Kachelzeile (Issue #25): aktueller Wert, Abstand zum
// Sieben-Tage-Schnitt und die Mini-Kurve des Zeitraums — der Stand von heute, ohne
// dass man ein Chart lesen muss.
//
// Das Delta bleibt bewusst **ungefärbt**: ob ein hoher Wert gut ist, hängt vom Marker
// ab (HRV hoch ist gut, Ruhepuls hoch ist es nicht), und die Deutung ist laut PRD
// nicht Sache dieser Fläche. Die Kachel zeigt, sie urteilt nicht.
const props = defineProps<{
  titel: string
  /** Der aktuelle Stand, gerechnet in koerperdatenSerien. */
  kennzahl: Kennzahl
  /** Der Verlauf desselben Markers über den Zeitraum — die Mini-Kurve. */
  serie: (number | null)[]
  einheit?: string
  /** Nachkommastellen der Anzeige; Standard 0. */
  stellen?: number
  /** Tailwind-Strichklasse der Mini-Kurve, z. B. `stroke-info`. */
  strich?: string
}>()

const zahl = (wert: number, stellen = props.stellen ?? 0) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }).format(wert)

const wertText = computed(() =>
  props.kennzahl.wert === null ? '–' : zahl(props.kennzahl.wert),
)

/** „+2", „−1,3", „±0" — der Abstand zum eigenen Schnitt, mit echtem Minuszeichen. */
const deltaText = computed(() => {
  const delta = props.kennzahl.delta
  if (delta === null) return null
  if (Math.round(delta * 10) === 0) return '±0'

  const stellen = Math.abs(delta) < 10 && !Number.isInteger(delta) ? 1 : 0
  return `${delta > 0 ? '+' : '−'}${zahl(Math.abs(delta), stellen)}`
})
</script>

<template>
  <UCard :ui="{ body: 'p-3' }">
    <p class="truncate text-xs text-muted">{{ titel }}</p>

    <p class="mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl">
      {{ wertText }}<span v-if="einheit && kennzahl.wert !== null" class="ml-1 text-xs font-normal text-muted">{{ einheit }}</span>
    </p>

    <p class="mt-0.5 text-xs text-dimmed tabular-nums">
      <template v-if="deltaText">{{ deltaText }} zum 7-Tage-Schnitt</template>
      <template v-else>keine Messung im Zeitraum</template>
    </p>

    <!-- Platz für Zusätze einzelner Marker, z. B. das HRV-Baseline-Band. -->
    <div class="mt-2">
      <slot />
    </div>

    <MiniKurve class="mt-2" :werte="serie" :strich="strich" />
  </UCard>
</template>
