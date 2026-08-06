<script setup lang="ts">
// Kopfzeile aller Athleten-Seiten (Issue #13, erweitert in #24) — trägt die
// gesamte Navigation, damit Blättern UND Speichern beim Scrollen immer erreichbar
// bleiben. Das sticky Gerüst, das Konto-Menü und der Admin-Eintrag kommen aus
// AppHeader; hier die athletenspezifischen Zonen:
//   links  – Umschalter zwischen den beiden Flächen: Dashboard und Steuerung
//   mitte  – Wochen-Switcher, nur im Steuerungs-Kontext: die 3 neuesten als
//            Shortcut-Chips (der häufige Fall), ein "Ältere"-Dropdown als Zugang zu
//            den alten Wochen, ‹ › zum Blättern
//   rechts – Actions-Slot (z. B. Speichern), nur im Edit-Kontext gefüllt
//
// Athlet-Identität und Abmelden standen bis ADR-0007 hier links; seit die Anmeldung
// eine Session ist statt eines Secrets in der URL, gehören sie ins Konto-Menü rechts —
// dorthin, wo sie auf jeder Fläche gleich zu finden sind.
const props = defineProps<{
  /** Welche Fläche gerade offen ist — steuert Umschalter und Wochen-Navigation. */
  bereich: 'dashboard' | 'steuerung'
  wochen?: string[]
  currentKw?: string
}>()

// Die Wege sind seit ADR-0007 fest: keine Secret-Präfixe mehr, die mitgereicht werden
// müssten.
const dashboardBase = '/'
const base = '/steuerung'

// Store liefert kw aufsteigend; defensiv sortieren (lexikografisch = chronologisch).
const sorted = computed(() => [...(props.wochen ?? [])].sort())

// Die 3 neuesten chronologisch (Mini-Zeitstrahl: links früher, rechts später).
const shortcuts = computed(() => sorted.value.slice(-3))
// Der Rest, neueste zuerst — die "alten" Wochen fürs Dropdown.
const olderItems = computed(() =>
  sorted.value
    .slice(0, -3)
    .reverse()
    .map((kw) => ({ label: kw, to: `${base}/${kw}` })),
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
  <AppHeader>
    <div class="flex items-center gap-1">
      <UButton
        :to="dashboardBase"
        :color="bereich === 'dashboard' ? 'primary' : 'neutral'"
        :variant="bereich === 'dashboard' ? 'soft' : 'ghost'"
        size="sm"
      >Dashboard</UButton>
      <UButton
        :to="base"
        :color="bereich === 'steuerung' ? 'primary' : 'neutral'"
        :variant="bereich === 'steuerung' ? 'soft' : 'ghost'"
        size="sm"
      >Steuerung</UButton>
    </div>

    <div class="flex-1" />

    <div v-if="bereich === 'steuerung' && sorted.length" class="flex items-center gap-1">
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
  </AppHeader>
</template>
