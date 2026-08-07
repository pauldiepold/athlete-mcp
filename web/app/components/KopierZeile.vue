<script setup lang="ts">
// Ein Text zum Kopieren, im Klartext daneben (Issue #52): die persönliche Adresse und
// der Startsatz.
//
// Der Text steht sichtbar und nicht nur hinter dem Knopf, weil beide Kopiervorgänge
// woanders enden — in Claudes Connector-Dialog und im Chat. Wer dort feststellt, dass
// nichts eingefügt wurde, muss den Text ablesen können; er ist deshalb auch
// markierbar, nicht bloß ein Icon mit Tooltip.
const props = defineProps<{ text: string; label: string }>()

const { kopiert, kopieren } = useKopieren(() => props.text)
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <code class="min-w-0 flex-1 truncate rounded-md bg-elevated px-3 py-2 text-sm">
      {{ text }}
    </code>

    <UButton
      color="neutral"
      variant="subtle"
      size="sm"
      :icon="kopiert ? 'i-lucide-check' : 'i-lucide-copy'"
      :aria-label="label"
      @click="kopieren"
    >
      {{ kopiert ? 'Kopiert' : 'Kopieren' }}
    </UButton>
  </div>
</template>
