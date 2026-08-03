<script setup lang="ts">
import {
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import 'chartjs-adapter-date-fns'
import type { Farbname } from '~/composables/useChartFarben'

// Der eigentliche Chart (Issue #24) — hier und nur hier liegt Chart.js. Trägt die
// gemeinsamen Konventionen aller Körperdaten-Verläufe:
//   - Zeitskala auf Tagesraster (Abstände entsprechen echten Tagen, nicht Positionen)
//   - Lücken bleiben Lücken: spanGaps ist aus, eine Linie zieht nie über einen Tag
//     ohne Messwert hinweg
//   - Farben aus den CSS-Variablen von Nuxt UI (useChartFarben) → Hell/Dunkel ohne
//     Sonderweg, Neu-Rendern beim Umschalten inklusive
//
// Bewusst .client.vue: Chart.js braucht ein echtes <canvas>.
const props = defineProps<{
  tage: string[]
  linien: { label: string; werte: (number | null)[]; farbe?: Farbname }[]
  band?: { label: string; unten: (number | null)[]; oben: (number | null)[] }
  einheit?: string
}>()

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Filler,
  Legend,
  Tooltip,
)

const { farbe } = useChartFarben()

// Ohne eigenes Label taucht ein Datensatz nicht in der Legende auf — so trägt das
// Band einen Legendeneintrag statt zweier Grenzlinien.
const OHNE_LEGENDE = ''

const data = computed(() => {
  const bandFarbe = farbe('primaer', 0.14)

  return {
    labels: props.tage,
    datasets: [
      // Zuerst das Band: die untere Grenze füllt bis zur nächsten (der oberen),
      // beide zeichnen keine sichtbare Linie. Reihenfolge = Malreihenfolge, die
      // Linien liegen also darüber.
      ...(props.band
        ? [
            {
              label: props.band.label,
              data: props.band.unten,
              fill: '+1',
              backgroundColor: bandFarbe,
              borderColor: 'transparent',
              borderWidth: 0,
              pointRadius: 0,
            },
            {
              label: OHNE_LEGENDE,
              data: props.band.oben,
              fill: false,
              borderColor: 'transparent',
              borderWidth: 0,
              pointRadius: 0,
            },
          ]
        : []),
      ...props.linien.map((linie, i) => {
        const linienFarbe = farbe(linie.farbe ?? (i === 0 ? 'primaer' : 'sekundaer'))
        return {
          label: linie.label,
          data: linie.werte,
          fill: false,
          borderColor: linienFarbe,
          backgroundColor: linienFarbe,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.25,
        }
      }),
    ],
  }
})

const options = computed(() => {
  const beschriftung = farbe('gedaempft')
  const gitter = farbe('gitter')
  const einheit = props.einheit ? ` ${props.einheit}` : ''

  return {
    responsive: true,
    maintainAspectRatio: false,
    // Eine Lücke ist eine Lücke — nichts wird überbrückt.
    spanGaps: false,
    interaction: { mode: 'index' as const, intersect: false },
    scales: {
      x: {
        type: 'time' as const,
        time: { unit: 'day' as const, tooltipFormat: 'dd.MM.yyyy', displayFormats: { day: 'dd.MM.' } },
        grid: { display: false },
        ticks: { color: beschriftung, maxRotation: 0, autoSkipPadding: 24 },
        border: { color: gitter },
      },
      y: {
        grid: { color: gitter },
        ticks: { color: beschriftung },
        border: { display: false },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: beschriftung,
          boxWidth: 12,
          filter: (eintrag: { text?: string }) => eintrag.text !== OHNE_LEGENDE,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `${ctx.dataset.label}: ${ctx.parsed.y ?? '–'}${einheit}`,
        },
        filter: (ctx: { dataset: { label?: string } }) => ctx.dataset.label !== OHNE_LEGENDE,
      },
    },
  }
})
</script>

<template>
  <Line :data="data" :options="options" />
</template>
