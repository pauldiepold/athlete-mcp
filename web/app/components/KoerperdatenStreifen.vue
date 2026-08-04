<script setup lang="ts">
import { wochenZeitraum } from '@shared/garmin/isoWoche'
import type { WochenAggregat } from '@shared/garmin/koerperdatenWochen'

// Der Körperdaten-Streifen über dem Wochendokument der Steuerung (Issue #28,
// Richtung 2 der Steuerungs-Brücke): Ø Index, Ø Schlaf und die HRV-Mini-Kurve der
// Woche, dazu der Rücksprung ins Dashboard mit dem Zeitraum genau dieser Woche.
//
// `woche` ist `undefined`, wenn diese Woche weder Körperdaten noch einen
// Steuerungseintrag hat (koerperdatenWochen lässt eine solche Woche ganz aus der
// Liste). Der Streifen zeigt dann dieselbe schmale Zeile mit Platzhaltern statt
// eines Fehlers — feste Höhe, damit beim Laden kein Sprung im Layout entsteht.
// Rein lesend: hier wird nichts editiert, nur zurückverwiesen.
const props = defineProps<{
  secret: string
  kw: string
  woche?: WochenAggregat
}>()

const zahl = (wert: number, stellen: number) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }).format(wert)

const indexText = computed(() =>
  props.woche?.indexSchnitt == null ? '–' : zahl(props.woche.indexSchnitt, 1),
)
const schlafText = computed(() =>
  props.woche?.schlafStundenSchnitt == null
    ? '–'
    : `${zahl(props.woche.schlafStundenSchnitt, 1)} h`,
)
const hrvSerie = computed(() => props.woche?.hrvSerie ?? [])

// Derselbe Zeitraum, den auch der Server für das Aggregat dieser Woche liest
// (wochenZeitraum/isoWoche) — eine Kalender-Arithmetik, an einer Stelle.
const dashboardLink = computed(() => {
  const { von, bis } = wochenZeitraum(props.kw)
  return { path: `/${props.secret}`, query: { von, bis } }
})
</script>

<template>
  <div
    class="mb-4 flex h-14 items-center gap-4 rounded-lg border border-default bg-elevated/50 px-3 text-sm sm:gap-6 sm:px-4"
  >
    <div class="flex items-baseline gap-1.5">
      <span class="text-muted">Ø Index</span>
      <span class="font-medium tabular-nums">{{ indexText }}</span>
    </div>

    <div class="flex items-baseline gap-1.5">
      <span class="text-muted">Ø Schlaf</span>
      <span class="font-medium tabular-nums">{{ schlafText }}</span>
    </div>

    <div class="h-7 w-20 shrink-0 sm:w-28">
      <MiniKurve :werte="hrvSerie" />
    </div>

    <div class="flex-1" />

    <UButton :to="dashboardLink" color="neutral" variant="ghost" size="xs" class="shrink-0">
      Dashboard: {{ kw }} ›
    </UButton>
  </div>
</template>
