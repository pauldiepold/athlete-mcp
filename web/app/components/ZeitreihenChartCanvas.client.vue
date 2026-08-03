<script setup lang="ts">
import {
  BarController,
  BarElement,
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
import { Chart as ChartComponent } from 'vue-chartjs'
import 'chartjs-adapter-date-fns'
import type { Band, Reihe } from '~/types/zeitreihe'

// Der eigentliche Chart (Issue #24, erweitert in #25) — hier und nur hier liegt
// Chart.js. Trägt die gemeinsamen Konventionen aller Körperdaten-Verläufe:
//   - Zeitskala auf Tagesraster (Abstände entsprechen echten Tagen, nicht Positionen)
//   - Lücken bleiben Lücken: spanGaps ist aus, eine Linie zieht nie über einen Tag
//     ohne Messwert hinweg, und ein Balken fehlt dort ganz
//   - zwei y-Achsen, damit zwei Größen mit verschiedenen Einheiten nebeneinander
//     lesbar sind (Bereitschaft gegen akute Last, Schlafdauer gegen Schlafscore)
//   - Stapel nur, wo einer gemeint ist: jede Reihe bekommt eine eigene Stapel-Gruppe,
//     nur gleichnamige Gruppen werden übereinandergesetzt. Ohne das würde Chart.js
//     alle Balken eines Charts in einen Stapel werfen
//   - Farben aus den CSS-Variablen von Nuxt UI (useChartFarben) → Hell/Dunkel ohne
//     Sonderweg, Neu-Rendern beim Umschalten inklusive
//
// Bewusst .client.vue: Chart.js braucht ein echtes <canvas>.
const props = defineProps<{
  tage: string[]
  reihen: Reihe[]
  band?: Band
  einheit?: string
  einheitRechts?: string
}>()

Chart.register(
  LineController,
  LineElement,
  BarController,
  BarElement,
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

/** Auf welcher Achse eine Reihe liegt — die Achsen-Id in der Chart.js-Konfiguration. */
function achsenId(reihe: Reihe): 'y' | 'y2' {
  return reihe.achse === 'rechts' ? 'y2' : 'y'
}

const hatRechteAchse = computed(() => props.reihen.some(r => r.achse === 'rechts'))
const wirdGestapelt = computed(() => props.reihen.some(r => r.stapel !== undefined))

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
              type: 'line' as const,
              label: props.band.label,
              data: props.band.unten,
              fill: '+1',
              backgroundColor: bandFarbe,
              borderColor: 'transparent',
              borderWidth: 0,
              pointRadius: 0,
              stack: 'band-unten',
            },
            {
              type: 'line' as const,
              label: OHNE_LEGENDE,
              data: props.band.oben,
              fill: false,
              borderColor: 'transparent',
              borderWidth: 0,
              pointRadius: 0,
              stack: 'band-oben',
            },
          ]
        : []),
      ...props.reihen.map((reihe, i) => {
        const name = reihe.farbe ?? (i === 0 ? 'primaer' : 'sekundaer')
        const linienFarbe = farbe(name)
        // Eigene Gruppe je Reihe, sofern kein gemeinsamer Stapel gewünscht ist —
        // sonst addierte Chart.js in einem gestapelten Chart auch die Linien auf.
        const stack = reihe.stapel ?? `einzeln-${i}`

        if (reihe.art === 'balken') {
          return {
            type: 'bar' as const,
            label: reihe.label,
            data: reihe.werte,
            yAxisID: achsenId(reihe),
            stack,
            // Lade- und Zehrtage sind an der Farbe zu unterscheiden, nicht erst am
            // Vorzeichen der Achsenbeschriftung.
            backgroundColor: reihe.vorzeichenfarben
              ? reihe.werte.map(w =>
                  farbe((w ?? 0) < 0 ? 'warnung' : 'erfolg', 0.75),
                )
              : farbe(name, 0.75),
            borderWidth: 0,
          }
        }

        const flaeche = reihe.art === 'flaeche'
        return {
          type: 'line' as const,
          label: reihe.label,
          data: reihe.werte,
          yAxisID: achsenId(reihe),
          stack,
          fill: flaeche ? ('origin' as const) : false,
          backgroundColor: flaeche ? farbe(name, 0.18) : linienFarbe,
          borderColor: linienFarbe,
          borderWidth: flaeche ? 1 : 2,
          borderDash: reihe.gestrichelt ? [4, 4] : undefined,
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
  const einheitRechts = props.einheitRechts ? ` ${props.einheitRechts}` : ''

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
        stacked: wirdGestapelt.value,
        grid: { display: false },
        ticks: { color: beschriftung, maxRotation: 0, autoSkipPadding: 24 },
        border: { color: gitter },
      },
      y: {
        stacked: wirdGestapelt.value,
        grid: { color: gitter },
        ticks: { color: beschriftung },
        border: { display: false },
      },
      // Die zweite Achse ohne eigenes Gitternetz: ein zweites Raster über demselben
      // Bild wäre nur Unruhe.
      y2: {
        display: hatRechteAchse.value,
        position: 'right' as const,
        grid: { display: false },
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
          label: (ctx: {
            dataset: { label?: string, yAxisID?: string }
            parsed: { y: number | null }
          }) =>
            `${ctx.dataset.label}: ${ctx.parsed.y ?? '–'}`
            + (ctx.dataset.yAxisID === 'y2' ? einheitRechts : einheit),
        },
        filter: (ctx: { dataset: { label?: string } }) => ctx.dataset.label !== OHNE_LEGENDE,
      },
    },
  }
})
</script>

<template>
  <!-- Basistyp bar: gemischte Charts (Balken plus Linie) brauchen einen Basistyp,
       den einzelne Datensätze überschreiben. -->
  <ChartComponent type="bar" :data="data" :options="options" />
</template>
