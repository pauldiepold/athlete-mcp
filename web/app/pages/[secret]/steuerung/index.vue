<script setup lang="ts">
// Steuerungs-Übersicht (Issue #13): Steuerungsplan gerendert + „Bearbeiten" sowie die
// Wochenliste (neueste zuerst). Löst die frühere server-gerenderte Worker-Ansicht im
// Nuxt-Frontend ab, damit Index/Plan/Woche einheitlich aussehen.
const route = useRoute()
const secret = route.params.secret as string

const { data, error } = await useFetch(`/api/${secret}/steuerung`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

const user = computed(() => data.value?.user ?? '')
const plan = computed(() => data.value?.plan ?? '')
const wochenAsc = computed(() => data.value?.wochen ?? [])
// Für die Liste neueste zuerst.
const wochen = computed(() => [...wochenAsc.value].reverse())
</script>

<template>
  <div>
    <SteuerungHeader :user="user" :secret="secret" :wochen="wochenAsc" />

    <UContainer class="py-8 max-w-3xl">
      <div class="flex items-center gap-4 mb-4">
        <h2 class="text-lg font-semibold">Steuerungsplan</h2>
        <div class="flex-1" />
        <UButton :to="`/${secret}/steuerung/edit`" variant="soft" size="sm">Bearbeiten</UButton>
      </div>
      <MarkdownPreview v-if="plan" :source="plan" class="mb-10" />
      <p v-else class="text-muted italic mb-10">Noch kein Steuerungsplan gesetzt.</p>

      <h2 class="text-lg font-semibold mb-3">Wochen</h2>
      <div v-if="wochen.length" class="flex flex-col gap-1">
        <ULink
          v-for="kw in wochen"
          :key="kw"
          :to="`/${secret}/steuerung/${kw}`"
          class="px-3 py-2 rounded-md hover:bg-elevated transition-colors"
        >{{ kw }}</ULink>
      </div>
      <p v-else class="text-muted italic">Noch keine Wocheneinträge.</p>
    </UContainer>
  </div>
</template>
