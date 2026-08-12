<script setup lang="ts">
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

// Der Wochen-Key reist als er selbst auf die Verläufe — die Umrechnung in sieben
// Kalendertage (wochenZeitraum) macht dort der Bereichs-Endpunkt, an einer Stelle.
//
// Ziel ist seit Issue #60 `/dashboard` und nicht mehr `/`: Den `kw`-Ausschnitt liest
// allein `KoerperdatenVerlaeufe`, und die Komponente steht auf der Startseite nicht
// mehr — der Sprung landete dort auf der Startseite und verlöre seine Woche.
const verlaeufeLink = computed(() => ({
  path: '/dashboard',
  query: { kw: props.kw },
}))
</script>

<template>
  <!-- Auf dem Handy ist die Zeile knapp: Die Zahlen sind die Hauptsache und bleiben,
       die HRV-Kurve entfällt (sie braucht Breite, um überhaupt eine Kurve zu sein),
       und der Knopf trägt die kw erst ab `sm` — die Woche steht direkt darüber im
       Titel, im Knopf wäre sie dieselbe Angabe ein zweites Mal. -->
  <div
    class="mb-4 flex h-14 items-center gap-3 rounded-lg border border-default bg-elevated/50 px-3 text-xs sm:gap-6 sm:px-4 sm:text-sm"
  >
    <div class="flex min-w-0 items-baseline gap-1.5">
      <span class="text-muted">Ø Index</span>
      <span class="font-medium tabular-nums">{{ indexText }}</span>
    </div>

    <div class="flex min-w-0 items-baseline gap-1.5">
      <span class="text-muted">Ø Schlaf</span>
      <span class="font-medium tabular-nums">{{ schlafText }}</span>
    </div>

    <div class="hidden h-7 w-20 shrink-0 sm:block sm:w-28">
      <MiniKurve :werte="hrvSerie" />
    </div>

    <div class="flex-1" />

    <UButton :to="verlaeufeLink" color="neutral" variant="ghost" size="xs" class="shrink-0">
      Körperdaten<span class="hidden sm:inline">: {{ kw }}</span> ›
    </UButton>
  </div>
</template>
