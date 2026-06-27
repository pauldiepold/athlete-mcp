<script setup lang="ts">
import { marked } from 'marked'

// Steuerungsplan im Browser editieren (Issue #12): schlichter Markdown-Quelltext-
// Editor mit marked-Live-Preview. Gespeichert wird byte-genau das getippte Markdown
// (Last-Write-Wins, ADR-0004) — dieselbe marked-Konfig wie die Server-Lese-Ansicht,
// damit Preview und gerenderte Ansicht nicht driften.
const route = useRoute()
const secret = route.params.secret as string

const { data, error } = await useFetch(`/api/${secret}/steuerung/plan`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

const markdown = ref(data.value?.markdown ?? '')
const savedMarkdown = ref(markdown.value)
const dirty = computed(() => markdown.value !== savedMarkdown.value)

const preview = computed(() => marked.parse(markdown.value, { gfm: true, async: false }))

const saving = ref(false)
const saveError = ref<string | null>(null)

async function save() {
  saving.value = true
  saveError.value = null
  try {
    await $fetch(`/api/${secret}/steuerung/plan`, {
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
  <UContainer class="py-8">
    <div class="flex items-center gap-4 mb-6">
      <h1 class="text-xl font-semibold">Steuerungsplan bearbeiten</h1>
      <ULink :to="`/${secret}/steuerung`" class="text-primary">Zur Ansicht</ULink>
      <div class="flex-1" />
      <span v-if="dirty" class="text-sm text-muted">Ungespeicherte Änderungen</span>
      <span v-else class="text-sm text-muted">Gespeichert</span>
      <UButton :loading="saving" :disabled="!dirty" @click="save">Speichern</UButton>
    </div>

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
        placeholder="# Steuerungsplan…"
      />
      <!-- Agent-geschriebenes Markdown, vertrauenswürdig (Single-Writer je Plan) →
           bewusst kein zusätzliches Sanitizing über marked hinaus, wie die Server-Ansicht. -->
      <div class="markdown-preview rounded-md border border-default p-4" v-html="preview" />
    </div>
  </UContainer>
</template>

<style scoped>
.markdown-preview :deep(h1) { font-size: 1.5rem; font-weight: 600; margin: 0.5rem 0; }
.markdown-preview :deep(h2) { font-size: 1.2rem; font-weight: 600; margin: 1.5rem 0 0.5rem; }
.markdown-preview :deep(table) { border-collapse: collapse; width: 100%; margin: 1rem 0; }
.markdown-preview :deep(th),
.markdown-preview :deep(td) {
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  padding: 0.4rem 0.6rem;
  text-align: left;
}
.markdown-preview :deep(a) { color: #2563eb; }
.markdown-preview :deep(ul) { padding-left: 1.25rem; list-style: disc; }
.markdown-preview :deep(ol) { padding-left: 1.25rem; list-style: decimal; }
.markdown-preview :deep(pre) {
  padding: 0.8rem;
  overflow-x: auto;
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-radius: 6px;
}
.markdown-preview :deep(code) { font-family: ui-monospace, monospace; }
</style>
