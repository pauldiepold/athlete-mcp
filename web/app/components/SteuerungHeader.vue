<script setup lang="ts">
// Sticky-Kopfzeile der Steuerungs-Seiten (Issue #13) — trägt die gesamte Navigation,
// damit Blättern UND Speichern beim Scrollen immer erreichbar bleiben. Drei Zonen:
//   links  – Athlet-Identität (Avatar + Name), verlinkt auf die Übersicht (Heimat)
//   mitte  – Wochen-Switcher: die 3 neuesten als Shortcut-Chips (der häufige Fall),
//            ein "Ältere"-Dropdown als Zugang zu den alten Wochen, ‹ › zum Blättern
//   rechts – Actions-Slot (z. B. Speichern), nur im Edit-Kontext gefüllt
const props = defineProps<{
  user: string
  secret: string
  wochen?: string[]
  currentKw?: string
}>()

// Athlet-Key großgeschrieben (z. B. "paul" → "Paul"); Avatar = Initial.
const displayName = computed(() => props.user.charAt(0).toUpperCase() + props.user.slice(1))

const base = computed(() => `/${props.secret}/steuerung`)

// Store liefert kw aufsteigend; defensiv sortieren (lexikografisch = chronologisch).
const sorted = computed(() => [...(props.wochen ?? [])].sort())

// Die 3 neuesten chronologisch (Mini-Zeitstrahl: links früher, rechts später).
const shortcuts = computed(() => sorted.value.slice(-3))
// Der Rest, neueste zuerst — die "alten" Wochen fürs Dropdown.
const olderItems = computed(() =>
  sorted.value
    .slice(0, -3)
    .reverse()
    .map((kw) => ({ label: kw, to: `${base.value}/${kw}` })),
)

// Prev/Next relativ zur offenen Woche, Lücken überspringend (nur auf der Wochen-Seite).
const prev = computed(() =>
  props.currentKw ? [...sorted.value].reverse().find((w) => w < props.currentKw!) : undefined,
)
const next = computed(() =>
  props.currentKw ? sorted.value.find((w) => w > props.currentKw!) : undefined,
)

// Kurzlabel fürs Chip: "2026-W26" → "W26" (Jahr steht im Dropdown / Seitentitel).
function short(kw: string): string {
  return kw.slice(5)
}
</script>

<template>
  <header
    class="sticky top-0 z-10 border-b border-default bg-default/80 backdrop-blur"
  >
    <UContainer class="flex flex-wrap items-center gap-3 py-3">
      <ULink
        :to="base"
        class="flex items-center gap-2.5 text-default hover:text-primary"
      >
        <UAvatar :text="displayName.charAt(0)" size="sm" />
        <span class="font-medium">{{ displayName }}</span>
      </ULink>

      <div class="flex-1" />

      <div v-if="sorted.length" class="flex items-center gap-1">
        <UButton
          v-if="currentKw"
          :to="prev ? `${base}/${prev}` : undefined"
          :disabled="!prev"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Vorherige Woche"
        >‹</UButton>

        <UButton
          v-for="w in shortcuts"
          :key="w"
          :to="`${base}/${w}`"
          :title="w"
          :color="w === currentKw ? 'primary' : 'neutral'"
          :variant="w === currentKw ? 'solid' : 'ghost'"
          size="sm"
        >{{ short(w) }}</UButton>

        <UDropdownMenu v-if="olderItems.length" :items="olderItems">
          <UButton color="neutral" variant="ghost" size="sm">Ältere ▾</UButton>
        </UDropdownMenu>

        <UButton
          v-if="currentKw"
          :to="next ? `${base}/${next}` : undefined"
          :disabled="!next"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Nächste Woche"
        >›</UButton>
      </div>

      <div class="flex-1" />

      <div class="flex items-center gap-4">
        <slot name="actions" />
      </div>
    </UContainer>
  </header>
</template>
