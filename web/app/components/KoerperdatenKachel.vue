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
  /**
   * Größere Typografie für eine Kachel, die doppelt so breit in der Kachelzeile
   * steht — dieselbe Kachel, nur lauter (Issue #26).
   */
  gross?: boolean
  /** Was statt des Deltas steht, wenn es keinen Wert gibt. */
  leerText?: string
  /**
   * Die id des ausführlichen Verlaufs zu diesem Marker. Ist sie gesetzt, wird die
   * Kachel anklickbar: Die Mini-Kurve zeigt, dass es da eine Bewegung gibt, der
   * Klick führt zu der Kurve, an der man sie lesen kann.
   */
  anker?: string
  /**
   * Die Seite, auf der der Verlauf steht — nur nötig, wenn die Kachelzeile
   * woanders hängt als die Charts (Startseite). Ohne sie wird auf derselben Seite
   * gescrollt.
   */
  zielSeite?: string
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

/**
 * Der Weg von der Zahl zu ihrem Verlauf: auf der Verläufe-Seite ein Sprung im
 * Dokument, von der Startseite aus ein Seitenwechsel mit demselben Anker. Beides
 * hier statt in zwei Aufrufern, damit die Kachel überall gleich reagiert.
 */
function zumVerlauf() {
  if (!props.anker) return
  if (props.zielSeite) return navigateTo(`${props.zielSeite}#${props.anker}`)

  const ziel = document.getElementById(props.anker)
  // Wer Bewegung abbestellt hat, bekommt den Sprung ohne Animation — der Weg ist
  // derselbe, nur ohne die Fahrt dorthin.
  ziel?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'start',
  })
}
</script>

<template>
  <!-- Mit Anker ist die ganze Kachel der Knopf: Die Trefferfläche ist die Karte, nicht
       ein kleiner Pfeil in der Ecke — auf dem Handy zählt das. Als Knopf auch für die
       Tastatur, mit `aria-label`, weil der sichtbare Text die Zahl ist und nicht das
       Ziel. -->
  <UCard
    :ui="{ body: gross ? 'p-3 sm:p-4' : 'p-3' }"
    :class="anker && 'cursor-pointer transition-colors hover:bg-elevated/50'"
    :role="anker ? 'button' : undefined"
    :tabindex="anker ? 0 : undefined"
    :aria-label="anker ? `${titel}: Verlauf ansehen` : undefined"
    @click="zumVerlauf"
    @keydown.enter.prevent="zumVerlauf"
    @keydown.space.prevent="zumVerlauf"
  >
    <p class="truncate text-muted" :class="gross ? 'text-sm' : 'text-xs'">{{ titel }}</p>

    <p
      class="mt-0.5 font-semibold tabular-nums"
      :class="gross ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl'"
    >
      {{ wertText }}<span v-if="einheit && kennzahl.wert !== null" class="ml-1 text-xs font-normal text-muted">{{ einheit }}</span>
    </p>

    <p class="mt-0.5 text-dimmed tabular-nums" :class="gross ? 'text-sm' : 'text-xs'">
      <template v-if="deltaText">{{ deltaText }} zum 7-Tage-Schnitt</template>
      <template v-else>{{ leerText ?? 'keine Messung im Zeitraum' }}</template>
    </p>

    <!-- Platz für Zusätze einzelner Marker, z. B. das HRV-Baseline-Band. Klicks
         bleiben hier: Der Aufklapper des Index sitzt in diesem Slot, und wer ihn
         öffnet, will nicht gleichzeitig weggescrollt werden. -->
    <div class="mt-2" @click.stop @keydown.stop>
      <slot />
    </div>

    <MiniKurve class="mt-2" :werte="serie" :strich="strich" />
  </UCard>
</template>
