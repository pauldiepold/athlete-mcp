<script setup lang="ts">
import type { WochenAggregat } from '@shared/garmin/koerperdatenWochen'

// Die Wochenliste unter den Charts (Issue #28, Richtung 1 der Steuerungs-Brücke):
// „das hatte ich geplant" (Auszug des Steuerungs-Wocheneintrags) neben „so hat mein
// Körper die Woche erlebt" (das Aggregat aus koerperdatenWochen). Eine Woche ohne
// Steuerungseintrag erscheint trotzdem, nur ohne Auszug — der Link führt dann in eine
// noch leere Woche, die sich durch Speichern anlegt (wie überall in der Steuerung).
//
// Rein lesend: ein Klick verlässt das Dashboard in Richtung Steuerung, editiert wird
// hier nichts.
const props = defineProps<{
  wochen: (WochenAggregat & { auszug: string | null })[]
  secret: string
}>()

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
    </template>

    <p v-if="absteigend.length === 0" class="text-sm text-muted italic">
      Noch keine Woche mit Körperdaten oder Steuerungseintrag.
    </p>

    <ul v-else class="divide-y divide-default">
      <li
        v-for="woche in absteigend"
        :key="woche.kw"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0"
      >
        <ULink
          :to="`/${secret}/steuerung/${woche.kw}`"
          class="w-20 shrink-0 font-medium text-default hover:text-primary"
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
          <template v-else-if="!woche.hatSteuerungseintrag">Kein Steuerungseintrag</template>
        </p>

        <ULink
          :to="`/${secret}/steuerung/${woche.kw}`"
          class="shrink-0 text-xs text-muted hover:text-primary sm:text-sm"
        >
          Woche öffnen ›
        </ULink>
      </li>
    </ul>
  </UCard>
</template>
