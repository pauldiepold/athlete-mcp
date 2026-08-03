<script setup lang="ts">
import type { Achse, KoerperdatenIndex } from '@shared/garmin/koerperdatenIndex'
import { KALIBRIERUNG } from '@shared/garmin/koerperdatenIndex'

// Die große Kachel des Körperdaten-Index (Issue #26). Sie steht allein über der
// Kachelzeile und ist dieselbe Kachel wie die darunter, nur lauter — deshalb setzt
// sie auf KoerperdatenKachel auf statt daneben.
//
// Der Index ist **gerechnet, nicht gedeutet**. Die Kachel formuliert ihn deshalb
// durchgehend als Rechnung mit sichtbaren Bestandteilen: die Aufschlüsselung ist
// einen Klick entfernt und zeigt Punkte, Gewicht und Beitrag jedes Markers — damit
// zu sehen ist, welcher Marker heute nach unten zieht. Sie beansprucht ausdrücklich
// **nicht**, eine Tagesform-Einschätzung zu liefern; die entsteht im Chat aus Plan
// und Kontext, nicht aus vier gewichteten Zahlen (ADR-0006).
//
// Die Schwellen im Text kommen aus KALIBRIERUNG statt aus der Vorlage: wer die
// Gewichte nachjustiert, muss diese Datei nicht anfassen.
const props = defineProps<{ index: KoerperdatenIndex }>()

/** Wie eine Achse heißt und woraus ihre Punkte entstehen. */
const ACHSEN_TEXT: Record<Achse, { label: string, rechnung: string }> = {
  hrv: {
    label: 'HRV',
    rechnung: 'Position des Nachtwerts im eigenen Baseline-Band',
  },
  schlaf: {
    label: 'Schlaf',
    rechnung: 'Garmins Schlafscore',
  },
  ruhepuls: {
    label: 'Ruhepuls',
    rechnung: `Abweichung vom ${KALIBRIERUNG.ruhepuls.median_fenster}-Tage-Median`,
  },
  bereitschaft: {
    label: 'Bereitschaft',
    rechnung: 'Morgenwert der Training Readiness',
  },
}

const zahl = (wert: number, stellen = 1) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }).format(wert)

const prozent = (anteil: number) =>
  new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 }).format(anteil)

/** „2026-07-02" → „02.07." */
function kurz(datum: string): string {
  const [, monat, tag] = datum.split('-')
  return `${tag}.${monat}.`
}

const zeilen = computed(() =>
  props.index.aktuell.beitraege.map(b => ({
    ...b,
    ...ACHSEN_TEXT[b.achse],
    punkteText: b.punkte === null ? '–' : zahl(b.punkte, 0),
    gewichtText: b.gewicht === 0 ? '–' : prozent(b.gewicht),
    beitragText: b.beitrag === null ? '–' : zahl(b.beitrag),
  })),
)

/** Wie viele der vier Marker an diesem Tag gemessen wurden. */
const gemessen = computed(
  () => props.index.aktuell.beitraege.filter(b => b.punkte !== null).length,
)
</script>

<template>
  <KoerperdatenKachel
    gross
    titel="Körperdaten-Index"
    leer-text="zu wenige Marker für eine Zahl"
    :kennzahl="index.aktuell"
    :serie="index.serie"
  >
    <p class="text-xs text-dimmed">
      Gerechnet aus vier Markern mit festen Gewichten — keine Einschätzung, wie es dir
      heute geht.
      <template v-if="index.aktuell.tag">
        Stand {{ kurz(index.aktuell.tag) }}.
      </template>
    </p>

    <UCollapsible v-if="zeilen.length" class="mt-2">
      <template #default="{ open }">
        <UButton
          block
          color="neutral"
          variant="subtle"
          size="xs"
          :trailing-icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :label="
            index.aktuell.wert === null
              ? `Woraus er sich rechnen würde (${gemessen} von 4 gemessen)`
              : 'Woraus er sich zusammensetzt'
          "
        />
      </template>

      <template #content>
        <!-- Die Rechnung Zeile für Zeile: Punkte × Gewicht = Beitrag. Auf schmalen
             Geräten darf die Tabelle für sich scrollen, statt die Seite zu sprengen. -->
        <div class="mt-2 overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="text-dimmed">
              <tr>
                <th class="py-1 pr-2 font-normal">Marker</th>
                <th class="py-1 pr-2 text-right font-normal">Punkte</th>
                <th class="py-1 pr-2 text-right font-normal">Gewicht</th>
                <th class="py-1 text-right font-normal">Beitrag</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="zeile in zeilen" :key="zeile.achse" class="border-t border-default">
                <td class="py-1.5 pr-2">
                  <span class="font-medium">{{ zeile.label }}</span>
                  <span class="block text-dimmed">{{ zeile.rechnung }}</span>
                </td>
                <td class="py-1.5 pr-2 text-right tabular-nums">{{ zeile.punkteText }}</td>
                <td class="py-1.5 pr-2 text-right tabular-nums">{{ zeile.gewichtText }}</td>
                <td class="py-1.5 text-right tabular-nums">{{ zeile.beitragText }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="border-t border-default font-medium">
                <td class="py-1.5 pr-2" colspan="3">Summe</td>
                <td class="py-1.5 text-right tabular-nums">
                  {{ index.aktuell.wert === null ? '–' : zahl(index.aktuell.wert) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p class="mt-2 text-xs text-dimmed">
          Fehlt ein Marker, tragen die übrigen seinen Anteil mit. Fehlen mehr als
          {{ KALIBRIERUNG.hoechstens_fehlende_achsen }}, gibt es keine Zahl — eine Lücke
          statt einer Schätzung.
        </p>
      </template>
    </UCollapsible>
  </KoerperdatenKachel>
</template>
