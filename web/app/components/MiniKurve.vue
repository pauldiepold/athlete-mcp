<script setup lang="ts">
// Die Mini-Kurve einer Kachel (Issue #25): der Verlauf eines Markers als reines
// Inline-SVG. Bewusst **kein** Chart.js — die Kacheln stehen ganz oben und sollen
// beim ersten Rendern dastehen, nicht nach dem Hydrieren erscheinen. Das Markup
// entsteht dadurch schon auf dem Server; im Browser läuft dafür kein Javascript.
//
// Lücken bleiben auch hier Lücken: eine fehlende Messung trennt die Kurve in zwei
// Segmente, statt überbrückt zu werden.
const props = defineProps<{
  werte: (number | null)[]
  /** Tailwind-Strichklasse der Kurve, z. B. `stroke-primary`. */
  strich?: string
}>()

const BREITE = 100
const HOEHE = 28
/** Luft oben und unten, damit die Kurve an ihren Extremen nicht angeschnitten wird. */
const RAND = 2

const segmente = computed<string[]>(() => {
  const werte = props.werte
  const vorhanden = werte.filter((w): w is number => w !== null)
  if (vorhanden.length === 0) return []

  const min = Math.min(...vorhanden)
  const max = Math.max(...vorhanden)
  const spanne = max - min
  const schritt = werte.length > 1 ? BREITE / (werte.length - 1) : 0

  // Eine waagerechte Kurve (alle Werte gleich) läuft mittig durch, statt am oberen
  // oder unteren Rand zu kleben.
  const y = (wert: number) =>
    spanne === 0
      ? HOEHE / 2
      : RAND + (1 - (wert - min) / spanne) * (HOEHE - 2 * RAND)

  const punkte = (x: number, wert: number) =>
    `${Math.round(x * 100) / 100},${Math.round(y(wert) * 100) / 100}`

  const fertig: string[] = []
  let laufend: string[] = []

  werte.forEach((wert, i) => {
    if (wert === null) {
      if (laufend.length) fertig.push(laufend.join(' '))
      laufend = []
      return
    }
    const x = werte.length > 1 ? i * schritt : BREITE / 2
    laufend.push(punkte(x, wert))
  })
  if (laufend.length) fertig.push(laufend.join(' '))

  // Ein einzelner Punkt zwischen zwei Lücken zeichnet als polyline nichts — er wird
  // zu einem kurzen Strich, damit ein vereinzelter Messtag nicht verschwindet.
  return fertig.map((segment) => {
    if (segment.includes(' ')) return segment
    const [x, y] = segment.split(',').map(Number)
    return `${x! - 0.8},${y} ${x! + 0.8},${y}`
  })
})
</script>

<template>
  <!-- preserveAspectRatio="none" streckt das Bild auf die Kachelbreite; damit die
       Linie dabei nicht mitgestreckt wird, hängt an ihr vector-effect. -->
  <svg
    class="h-7 w-full"
    :viewBox="`0 0 ${BREITE} ${HOEHE}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <polyline
      v-for="(segment, i) in segmente"
      :key="i"
      :points="segment"
      fill="none"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
      :class="strich ?? 'stroke-primary'"
    />
  </svg>
</template>
