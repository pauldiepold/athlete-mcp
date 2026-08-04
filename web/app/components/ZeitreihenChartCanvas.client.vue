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
  engeAchse?: boolean
}>()

// Ein Klick auf den Chart meint einen **Tag**, nicht einen Punkt: die Seite bekommt
// das Datum und entscheidet selbst, was damit geschieht (im Dashboard: die
// Tages-Detailansicht öffnen, Issue #27). Chart.js bleibt auch dafür hier drin —
// welcher Tag getroffen wurde, weiß nur die Skala.
const emit = defineEmits<{ tagKlick: [tag: string] }>()

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

/** Der Teil der x-Skala, den die Tag-Zuordnung braucht (Chart.js, strukturell). */
interface Zeitskala {
  /** Zeitstempel des ersten Tages der Achse. */
  min: number
  getValueForPixel: (pixel: number) => number | undefined
}

const EIN_TAG_MS = 86_400_000

/**
 * Welcher Tag der Achse unter dieser Pixel-Position liegt.
 *
 * Bewusst über die **Skala** gerechnet und nicht über die getroffenen Datenpunkte:
 * sonst wäre ausgerechnet ein Tag ohne Messwert nicht anklickbar — der Tag also,
 * dessen Lücke man erklärt haben will. Die Achse ist eine dichte Kalender-Achse
 * (ein Eintrag je Tag, `koerperdatenSerien`), deshalb ist der Abstand zum ersten
 * Tag in Tagen zugleich der Index. Die Stunde, die eine Sommerzeit-Umstellung
 * verschiebt, ist gegen den halben Tag Rundungsspielraum ohne Belang.
 */
function tagAnPixel(skala: Zeitskala | undefined, pixel: number | null): string | undefined {
  if (!skala || pixel === null) return undefined

  const zeit = skala.getValueForPixel(pixel)
  if (zeit === undefined) return undefined

  const i = Math.round((zeit - skala.min) / EIN_TAG_MS)
  return props.tage[Math.min(Math.max(i, 0), props.tage.length - 1)]
}

/** Auf welcher Achse eine Reihe liegt — die Achsen-Id in der Chart.js-Konfiguration. */
function achsenId(reihe: Reihe): 'y' | 'y2' {
  return reihe.achse === 'rechts' ? 'y2' : 'y'
}

const hatRechteAchse = computed(() => props.reihen.some(r => r.achse === 'rechts'))
const wirdGestapelt = computed(() => props.reihen.some(r => r.stapel !== undefined))

// Der Chart hat den Basistyp „bar", und Chart.js zieht Wertachsen von Balken
// grundsätzlich bis zur Null — bei einer Größe, die um ihren eigenen Normalwert
// schwankt (Ruhepuls), presst das genau die Schwankung platt, die man sehen will.
// Mit `engeAchse` legt sich die linke Achse stattdessen um die Werte: erst ein
// Puffer nach beiden Seiten, dann nach außen auf Fünfer gerundet, damit die
// Beschriftung runde Zahlen behält und die Achse beim Blättern durch die Zeiträume
// nicht bei jedem Wert neu springt.
const ACHSEN_RASTER = 5
const ACHSEN_PUFFER = 5

const grenzenLinks = computed(() => {
  if (!props.engeAchse) return {}

  const werte = [
    ...props.reihen.filter(r => r.achse !== 'rechts').flatMap(r => r.werte),
    ...(props.band ? [...props.band.unten, ...props.band.oben] : []),
  ].filter((w): w is number => w !== null)
  if (werte.length === 0) return {}

  return {
    beginAtZero: false,
    min: Math.floor((Math.min(...werte) - ACHSEN_PUFFER) / ACHSEN_RASTER) * ACHSEN_RASTER,
    max: Math.ceil((Math.max(...werte) + ACHSEN_PUFFER) / ACHSEN_RASTER) * ACHSEN_RASTER,
  }
})

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
    // Ein Klick irgendwo im Chart meint den Tag unter dem Zeiger.
    onClick: (
      evt: { x: number | null },
      _aktive: unknown[],
      chart: { scales: Record<string, unknown> },
    ) => {
      const tag = tagAnPixel(chart.scales.x as Zeitskala | undefined, evt.x)
      if (tag) emit('tagKlick', tag)
    },
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
        ...grenzenLinks.value,
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
       den einzelne Datensätze überschreiben. Der Zeiger zeigt an, dass jeder Tag
       anklickbar ist (Issue #27). -->
  <ChartComponent type="bar" class="cursor-pointer" :data="data" :options="options" />
</template>
