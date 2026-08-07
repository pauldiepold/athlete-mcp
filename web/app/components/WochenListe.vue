<script setup lang="ts">
import type { WochenAggregat } from '@shared/garmin/koerperdatenWochen'

// Die Wochenliste unter den Charts (Issue #28, Richtung 1 der Steuerungs-Brücke):
// „das hatte ich geplant" (Auszug des Steuerungs-Wocheneintrags) neben „so hat mein
// Körper die Woche erlebt" (das Aggregat aus koerperdatenWochen). Eine Woche ohne
// Steuerungseintrag erscheint trotzdem, nur ohne Auszug — der Link führt dann in eine
// noch leere Woche, die sich durch Speichern anlegt (wie überall in der Steuerung).
//
// Die Liste ist zugleich die Wochen-Auswahl des Zeitraums: ein Klick auf die
// Kalenderwoche stellt die Charts darüber auf genau diese Woche (`?kw=`), statt die
// Seite zu verlassen — „diese Woche" ist der Ausschnitt, den kein Fenster aus
// 30/90/allen Tagen trifft. Erst „Trainingsbuch öffnen ›" wechselt in die Steuerung.
// Beides rein lesend, editiert wird hier nichts.
const props = defineProps<{
  wochen: (WochenAggregat & { auszug: string | null })[]
  /** Die aktuell als Zeitraum gewählte Woche — sie wird in der Liste hervorgehoben. */
  aktiveKw?: string | null
}>()

/**
 * Die Wochenwahl wirkt oben — in den Kacheln und Charts, nicht hier in der Liste.
 * Ohne den Sprung nach oben bliebe der Athlet unten stehen und bekäme von seiner
 * eigenen Auswahl nichts zu sehen; der Link sähe schlicht kaputt aus.
 */
function nachObenScrollen() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Neueste zuerst — die Liste liest sich wie ein Rückblick, nicht wie eine Zeitachse
// zum Abklappern.
const absteigend = computed(() => [...props.wochen].sort((a, b) => b.kw.localeCompare(a.kw)))

const zahl = (wert: number, stellen = 0) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }).format(wert)

const text = (wert: number | null, stellen = 0, einheit = '') =>
  wert === null ? '–' : `${zahl(wert, stellen)}${einheit}`
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-4' }">
    <template #header>
      <h2 class="text-sm font-medium sm:text-base">Wochen</h2>
      <p class="mt-0.5 text-xs text-muted">
        Ein Klick auf die Kalenderwoche zeigt oben genau ihre sieben Tage.
      </p>
    </template>

    <p v-if="absteigend.length === 0" class="text-sm text-muted italic">
      Noch keine Woche mit Körperdaten oder Eintrag im Trainingsbuch.
    </p>

    <ul v-else class="divide-y divide-default">
      <li
        v-for="woche in absteigend"
        :key="woche.kw"
        class="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-2.5 first:pt-0 last:pb-0"
        :class="woche.kw === aktiveKw ? 'rounded-md bg-elevated/60' : ''"
      >
        <ULink
          :to="{ path: '/', query: { kw: woche.kw } }"
          class="w-20 shrink-0 font-medium underline decoration-dotted underline-offset-4 hover:text-primary"
          :class="woche.kw === aktiveKw ? 'text-primary' : 'text-default'"
          @click="nachObenScrollen"
        >
          {{ woche.kw }}
        </ULink>

        <div class="flex shrink-0 gap-3 text-xs text-muted tabular-nums sm:text-sm">
          <span title="Ø Körperdaten-Index">Ø Index {{ text(woche.indexSchnitt, 1) }}</span>
          <span title="Ø Schlafdauer">Ø Schlaf {{ text(woche.schlafStundenSchnitt, 1, ' h') }}</span>
          <span title="Summe der akuten Last">Last {{ text(woche.akuteLastSumme, 0) }}</span>
        </div>

        <p class="min-w-0 flex-1 truncate text-sm text-dimmed">
          <template v-if="woche.auszug">{{ woche.auszug }}</template>
          <template v-else-if="!woche.hatSteuerungseintrag">Kein Eintrag im Trainingsbuch</template>
        </p>

        <ULink
          :to="`/steuerung/${woche.kw}`"
          class="shrink-0 text-xs text-muted hover:text-primary sm:text-sm"
        >
          Trainingsbuch öffnen ›
        </ULink>
      </li>
    </ul>
  </UCard>
</template>
