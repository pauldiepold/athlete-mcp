<script setup lang="ts">
// Dashboard — die Startseite des per-User-Links (Issue #24). Wer seinen Link öffnet,
// sieht als Erstes seine Körperdaten-Verläufe; die Steuerung liegt eine Ebene tiefer
// und ist über die Kopfzeile erreichbar. Auth unverändert: allein das View-Secret in
// der URL (ADR-0003/0004), server-seitig aufgelöst.
//
// Die Seite bleibt dumm: der Endpunkt liefert fertige Serien, gerechnet im getesteten
// Modul koerperdatenSerien. Zeitraum in diesem Slice fest auf die letzten 30 Tage.
const route = useRoute()
const secret = route.params.secret as string

const { data, error } = await useFetch(`/api/${secret}/koerperdaten/serien`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

useHead({
  title: data.value?.user ? `Körperdaten · ${data.value.user}` : 'Körperdaten',
})

/** „2026-07-01" → „01.07." — für die Zeitraum-Angabe über den Charts. */
function kurz(datum: string): string {
  const [, monat, tag] = datum.split('-')
  return `${tag}.${monat}.`
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <AthletHeader :user="data?.user ?? ''" :secret="secret" bereich="dashboard" />

    <UContainer class="w-full max-w-5xl flex-1 py-6">
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 class="text-xl font-semibold">Körperdaten</h1>
        <p v-if="data" class="text-sm text-muted">
          {{ kurz(data.von) }} – {{ kurz(data.bis) }}
        </p>
      </div>

      <ZeitreihenChart
        v-if="data"
        titel="HRV gegen das eigene Baseline-Band"
        einheit="ms"
        :tage="data.serien.tage"
        :band="{
          label: 'Baseline-Band',
          unten: data.serien.hrv.band_unten,
          oben: data.serien.hrv.band_oben,
        }"
        :linien="[
          { label: 'Nachtwert', werte: data.serien.hrv.nachtwert, farbe: 'primaer' },
          { label: 'Wochenschnitt', werte: data.serien.hrv.wochenschnitt, farbe: 'sekundaer' },
        ]"
      />
    </UContainer>
  </div>
</template>
