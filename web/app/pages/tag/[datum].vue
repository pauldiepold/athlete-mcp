<script setup lang="ts">
// Die Tages-Detailansicht (Issue #27): was der Verlauf im Dashboard verbirgt. Ein
// Klick auf einen Tag führt hierher, und hier steht der volle archivierte Tagesblob
// — die einzelnen Training-Readiness-Readings mit ihrem Auslöser und die
// Body-Battery-Ereignisse mit Impact und Garmins Feedback. Genau die Information,
// für die ADR-0002 die ereignisbasierte Form überhaupt eingeführt hat.
//
// Rein lesend. Die Seite bleibt dumm: der Endpunkt liefert den Blob unverändert,
// die Darstellung liegt in TagesZeitachse und TagesRohwerte.
const route = useRoute()
const datum = route.params.datum as string

// Ein Pfad, der kein Datum ist, wird gar nicht erst geladen — dieselbe Linie wie
// bei der Wochenseite (isValidKw).
if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

const { data, error } = await useFetch(`/api/koerperdaten/tag/${datum}`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

/** „2026-06-13" → „Samstag, 13.06.2026". Über UTC formatiert, sonst driftet der Tag. */
const langesDatum = computed(() =>
  new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${datum}T00:00:00Z`)),
)

useHead({ title: datum })

const readings = computed(() => data.value?.tag?.training_readiness ?? [])
const events = computed(() => data.value?.tag?.body_battery?.events ?? [])
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AthletHeader bereich="dashboard" />

    <UContainer class="w-full max-w-5xl flex-1 py-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-xl font-semibold">{{ langesDatum }}</h1>
          <p class="text-sm text-muted">Alles, was für diesen Tag archiviert ist.</p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton to="/" color="neutral" variant="ghost" size="sm">
            ‹ Dashboard
          </UButton>
          <!-- Die Brücke in die Steuerung: der Wochen-Key kommt aus isoWoche, damit
               ein Tag verlässlich am richtigen Wocheneintrag hängt. -->
          <UButton
            v-if="data?.kw"
            :to="`/steuerung/${data.kw}`"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            Steuerung: {{ data.kw }} ›
          </UButton>
        </div>
      </div>

      <template v-if="data">
        <div v-if="!data.tag" class="rounded-lg border border-default p-8 text-center">
          <p class="text-sm text-muted">
            Für diesen Tag ist nichts archiviert — vermutlich wurde die Uhr nicht
            getragen.
          </p>
        </div>

        <div v-else class="space-y-4">
          <!-- Der Kern: beide Spuren auf einer 24-Stunden-Achse. Ein Tag ohne
               Readings oder ohne Ereignisse bleibt hier leer, aber intakt. -->
          <UCard :ui="{ body: 'p-3 sm:p-4' }">
            <template #header>
              <h2 class="text-sm font-medium sm:text-base">Tagesverlauf</h2>
            </template>

            <TagesZeitachse
              :datum="datum"
              :readings="readings"
              :events="events"
            />
          </UCard>

          <UCard :ui="{ body: 'p-3 sm:p-4' }">
            <template #header>
              <h2 class="text-sm font-medium sm:text-base">Rohwerte</h2>
            </template>

            <TagesRohwerte :tag="data.tag" />
          </UCard>
        </div>
      </template>
    </UContainer>
  </div>
</template>
