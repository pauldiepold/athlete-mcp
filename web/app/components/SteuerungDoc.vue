<script setup lang="ts">
// Geteiltes Dokument-Gerüst der Steuerung (Issue #16): Ein Markdown-Dokument (Steuerungsplan
// oder Woche) wird zunächst nur gelesen und per Toggle in der Seite selbst bearbeitet — damit
// jede editierbare Seite identisch aussieht. View zeigt die MarkdownPreview, Edit den
// MarkdownEditor (Split + Sync-Scroll). Gespeichert wird byte-genau das getippte Markdown gegen
// `endpoint` (PUT, Last-Write-Wins, ADR-0004); die Seiten liefern nur die geladenen Daten.
const props = defineProps<{
  user: string
  secret: string
  wochen: string[]
  currentKw?: string
  title: string
  endpoint: string
  placeholder?: string
  initialMarkdown: string
}>()

// Default = View; Bearbeiten wird in der Seite selbst getoggelt.
const editing = ref(false)

const markdown = ref(props.initialMarkdown)
const savedMarkdown = ref(props.initialMarkdown)
const dirty = computed(() => markdown.value !== savedMarkdown.value)

const saving = ref(false)
const saveError = ref<string | null>(null)

async function save() {
  saving.value = true
  saveError.value = null
  try {
    await $fetch(props.endpoint, { method: 'PUT', body: { markdown: markdown.value } })
    savedMarkdown.value = markdown.value
  } catch {
    saveError.value = 'Speichern fehlgeschlagen.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex h-dvh flex-col">
    <AthletHeader
      :user="user"
      :secret="secret"
      bereich="steuerung"
      :wochen="wochen"
      :current-kw="currentKw"
    >
      <template #actions>
        <template v-if="editing">
          <span class="text-sm text-muted">{{ dirty ? 'Ungespeicherte Änderungen' : 'Gespeichert' }}</span>
          <UButton :loading="saving" :disabled="!dirty" @click="save">Speichern</UButton>
          <UButton color="neutral" variant="ghost" @click="editing = false">Schließen</UButton>
        </template>
        <UButton v-else variant="soft" @click="editing = true">Bearbeiten</UButton>
      </template>
    </AthletHeader>

    <UContainer class="flex w-full max-w-5xl flex-1 min-h-0 flex-col py-6">
      <h1 class="mb-4 text-xl font-semibold">{{ title }}</h1>

      <!-- Der Körperdaten-Streifen der Wochenseite (Issue #28, Richtung 2 der
           Steuerungs-Brücke) — leer auf dem Steuerungsplan, der diesen Slot nicht
           füllt. Schmal mit fester Höhe: das Editieren bleibt die Hauptsache der
           Seite, der Streifen verdrängt sie nicht. -->
      <slot name="vor-dokument" />

      <UAlert
        v-if="saveError"
        color="error"
        variant="subtle"
        :title="saveError"
        class="mb-4"
      />

      <MarkdownEditor
        v-if="editing"
        v-model="markdown"
        :placeholder="placeholder"
        class="flex-1 min-h-0"
      />
      <div v-else class="flex-1 min-h-0 overflow-auto">
        <MarkdownPreview v-if="markdown" :source="markdown" />
        <p v-else class="text-muted italic">Noch kein Inhalt — „Bearbeiten" zum Anlegen.</p>
      </div>
    </UContainer>
  </div>
</template>
