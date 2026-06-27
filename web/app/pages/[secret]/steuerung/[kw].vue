<script setup lang="ts">
import { isValidKw } from '@shared/steuerung/steuerungStore'

// Eine Woche im Browser lesen + editieren (Issue #13): Markdown-Quelltext-Editor mit
// MarkdownPreview-Live-Vorschau, gespiegelt vom Steuerungsplan-Edit (#12). Gespeichert
// wird byte-genau das getippte Markdown (Last-Write-Wins, ADR-0004); eine noch nicht
// existierende kw wird durch Speichern angelegt. Navigation (Shortcuts/Blättern) liegt
// in der Kopfzeile; currentKw markiert dort die offene Woche.
const route = useRoute()
const secret = route.params.secret as string
const kw = route.params.kw as string

// Ungültiges kw-Format gar nicht erst laden (^\d{4}-W\d{2}$, wie der Store).
if (!isValidKw(kw)) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

const { data, error } = await useFetch(`/api/${secret}/steuerung/woche/${kw}`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

const user = computed(() => data.value?.user ?? '')
const wochen = computed(() => data.value?.wochen ?? [])
const markdown = ref(data.value?.markdown ?? '')
const savedMarkdown = ref(markdown.value)
const dirty = computed(() => markdown.value !== savedMarkdown.value)

const saving = ref(false)
const saveError = ref<string | null>(null)

async function save() {
  saving.value = true
  saveError.value = null
  try {
    await $fetch(`/api/${secret}/steuerung/woche/${kw}`, {
      method: 'PUT',
      body: { markdown: markdown.value },
    })
    savedMarkdown.value = markdown.value
  } catch {
    saveError.value = 'Speichern fehlgeschlagen.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <SteuerungHeader :user="user" :secret="secret" :wochen="wochen" :current-kw="kw">
      <template #actions>
        <span class="text-sm text-muted">{{ dirty ? 'Ungespeicherte Änderungen' : 'Gespeichert' }}</span>
        <UButton :loading="saving" :disabled="!dirty" @click="save">Speichern</UButton>
      </template>
    </SteuerungHeader>

    <UContainer class="py-8 max-w-5xl">
      <h1 class="text-xl font-semibold mb-6">{{ kw }}</h1>

      <UAlert
        v-if="saveError"
        color="error"
        variant="subtle"
        :title="saveError"
        class="mb-4"
      />

      <div class="grid gap-4 md:grid-cols-2">
        <UTextarea
          v-model="markdown"
          :rows="24"
          :autoresize="false"
          class="w-full font-mono"
          :placeholder="`# ${kw}…`"
        />
        <div class="rounded-md border border-default p-4">
          <MarkdownPreview :source="markdown" />
        </div>
      </div>
    </UContainer>
  </div>
</template>
