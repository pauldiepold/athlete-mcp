<script setup lang="ts">
// Geteilter Markdown-Editor (Issue #16): Quelltext links/oben, Live-Preview rechts/unten.
// Beide Spalten füllen die vom Eltern-Container vorgegebene Höhe und scrollen je in sich;
// synchrones Scrolling hält die gerade editierte Stelle in beiden sichtbar. Proportionales
// Mapping über die Scroll-Ratio genügt (kein zeilengenaues Sync). Der Eltern-Container muss
// eine begrenzte Höhe vorgeben (z. B. via `class="flex-1 min-h-0"`).
const markdown = defineModel<string>({ required: true })
defineProps<{ placeholder?: string }>()

// `syncing` verhindert die Rückkopplung, wenn das Setzen von scrollTop selbst ein
// scroll-Event auf dem Ziel auslöst.
const editor = useTemplateRef<{ textareaRef: HTMLTextAreaElement | null }>('editor')
const previewPane = useTemplateRef<HTMLElement>('previewPane')
let syncing = false

function syncScroll(source: 'editor' | 'preview') {
  if (syncing) return
  const ta = editor.value?.textareaRef
  const pv = previewPane.value
  if (!ta || !pv) return

  const [from, to] = source === 'editor' ? [ta, pv] : [pv, ta]
  const fromMax = from.scrollHeight - from.clientHeight
  const toMax = to.scrollHeight - to.clientHeight
  if (fromMax <= 0 || toMax <= 0) return

  syncing = true
  to.scrollTop = (from.scrollTop / fromMax) * toMax
  requestAnimationFrame(() => {
    syncing = false
  })
}
</script>

<template>
  <div class="grid min-h-0 grid-rows-2 gap-4 md:grid-cols-2 md:grid-rows-1">
    <UTextarea
      ref="editor"
      v-model="markdown"
      :autoresize="false"
      class="h-full min-h-0 w-full font-mono"
      :ui="{ base: 'h-full resize-none' }"
      :placeholder="placeholder"
      @scroll="syncScroll('editor')"
    />
    <div
      ref="previewPane"
      class="min-h-0 overflow-auto rounded-md border border-default p-4"
      @scroll="syncScroll('preview')"
    >
      <MarkdownPreview :source="markdown" />
    </div>
  </div>
</template>
