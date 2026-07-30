<script setup lang="ts">
import { marked } from 'marked'

// Gemeinsamer Markdown-Renderer für Index-Plan, Plan-Edit-Preview und Wochen-Preview
// (Issue #13). Eine marked-Konfig an genau einer Stelle → Preview und gerenderte
// Ansicht driften nicht. Agent-geschriebenes Markdown, vertrauenswürdig (Single-Writer)
// → bewusst kein zusätzliches Sanitizing über marked hinaus, wie die Server-Ansicht.
const props = defineProps<{ source: string }>()
const html = computed(() => marked.parse(props.source, { gfm: true, async: false }))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown-prose" v-html="html" />
</template>

<style scoped>
.markdown-prose :deep(h1) { font-size: 1.5rem; font-weight: 600; margin: 0.5rem 0; }
.markdown-prose :deep(h2) { font-size: 1.2rem; font-weight: 600; margin: 1.5rem 0 0.5rem; }
.markdown-prose :deep(table) { border-collapse: collapse; width: 100%; margin: 1rem 0; }
.markdown-prose :deep(th),
.markdown-prose :deep(td) {
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  padding: 0.4rem 0.6rem;
  text-align: left;
}
.markdown-prose :deep(a) { color: #2563eb; }
.markdown-prose :deep(ul) { padding-left: 1.25rem; list-style: disc; }
.markdown-prose :deep(ol) { padding-left: 1.25rem; list-style: decimal; }
.markdown-prose :deep(pre) {
  padding: 0.8rem;
  overflow-x: auto;
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-radius: 6px;
}
.markdown-prose :deep(code) { font-family: ui-monospace, monospace; }
</style>
