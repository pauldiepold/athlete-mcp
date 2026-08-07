<script setup lang="ts">
// Geteiltes Dokument-Gerüst der Steuerung (Issue #16): Ein Markdown-Dokument (Steuerungsplan
// oder Woche) wird zunächst nur gelesen und per Toggle in der Seite selbst bearbeitet — damit
// jede editierbare Seite identisch aussieht. View zeigt die MarkdownPreview, Edit den
// MarkdownEditor (Split + Sync-Scroll). Gespeichert wird byte-genau das getippte Markdown gegen
// `endpoint` (PUT, Last-Write-Wins, ADR-0004); die Seiten liefern nur die geladenen Daten.
const props = defineProps<{
  wochen: string[]
  currentKw?: string
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
  <!-- Füllt die Restfläche unter der Kopfzeile (app.vue spannt die Spalte auf), damit
       der Editor die Höhe bekommt und die Fußzeile trotzdem unten bleibt. -->
  <div class="flex min-h-0 flex-1 flex-col">
    <AthletHeader bereich="steuerung">
      <template #actions>
        <template v-if="editing">
          <!-- Der Speicher-Zustand als Wort nur ab `sm`: Auf dem Handy braucht die
               Kopfzeile ihre Breite für die Knöpfe, und „Ungespeicherte Änderungen"
               steht ohnehin schon im `disabled` des Speichern-Knopfs. -->
          <span class="hidden text-sm text-muted sm:inline">{{ dirty ? 'Ungespeicherte Änderungen' : 'Gespeichert' }}</span>
          <UButton size="sm" :loading="saving" :disabled="!dirty" @click="save">Speichern</UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            aria-label="Bearbeiten schließen"
            @click="editing = false"
          />
        </template>
        <UButton v-else size="sm" variant="soft" icon="i-lucide-pencil" @click="editing = true">
          <span class="hidden sm:inline">Bearbeiten</span>
        </UButton>
      </template>
    </AthletHeader>

    <UContainer class="flex w-full max-w-5xl flex-1 min-h-0 flex-col py-6">
      <!-- Die Wochen-Auswahl ist zugleich die Überschrift der Seite — deshalb hat das
           Dokument keine eigene `h1` mehr: Die Woche stünde sonst zweimal
           untereinander, einmal als Titel und einmal als Auswahl. -->
      <WochenWahl :wochen="wochen" :current-kw="currentKw" />

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
