<script setup lang="ts">
import type { Verbindung } from '@shared/verbindungen'

// Das gemeinsame Gerüst einer Verbindungs-Karte (Issue #44): Name, Zustand, Meldung,
// darunter das Formular der jeweiligen Datenquelle im Slot.
//
// Die beiden Datenquellen sind sich in allem unähnlich — Final Surge ist ein
// Passwortfeld, Garmin ein zweistufiger SSO-Ablauf. Gemeinsam ist ihnen nur, wie ihr
// Zustand aussieht. Genau das steht hier, und nur das: Ein Versuch, auch die Formulare
// zu vereinheitlichen, hätte beide verbogen.
//
// Eine bestehende Verbindung zeigt das Formular erst auf Klick. Es dauerhaft offen zu
// lassen hieße, ein leeres Passwortfeld neben ein „verbunden" zu stellen — das liest
// sich, als fehlte noch etwas.
const props = defineProps<{
  verbindung: Verbindung
  /** Wozu diese Datenquelle gut ist — ein Satz, keine Werbung. */
  wofuer: string
}>()

const offen = ref(props.verbindung.zustand !== 'verbunden')

// Kaputt oder neu: Beides führt zum selben Formular, deshalb hier nur ein Wort.
const knopf = computed(() =>
  props.verbindung.zustand === 'fehlt' ? 'Verbinden' : 'Neu verbinden',
)

const abzeichen = computed(() => {
  switch (props.verbindung.zustand) {
    case 'verbunden':
      return { label: 'Verbunden', color: 'success' as const, icon: 'i-lucide-check' }
    case 'kaputt':
      return { label: 'Unterbrochen', color: 'error' as const, icon: 'i-lucide-triangle-alert' }
    default:
      return { label: 'Nicht verbunden', color: 'neutral' as const, icon: 'i-lucide-minus' }
  }
})

/** „2026-08-06T05:00:00Z" → „06.08.2026" — das Datum reicht, die Uhrzeit hilft nicht. */
function alsDatum(iso: string): string {
  const [jahr, monat, tag] = iso.slice(0, 10).split('-')
  return `${tag}.${monat}.${jahr}`
}

// Nach einem geglückten Verbinden schließt sich das Formular wieder; die Seite lädt
// den Zustand neu und die Karte zeigt das Ergebnis.
function fertig() {
  offen.value = false
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="font-semibold">{{ verbindung.name }}</h3>
          <p class="text-sm text-muted">{{ wofuer }}</p>
        </div>
        <UBadge
          :color="abzeichen.color"
          :icon="abzeichen.icon"
          variant="subtle"
          size="lg"
        >{{ abzeichen.label }}</UBadge>
      </div>
    </template>

    <UAlert
      v-if="verbindung.zustand === 'kaputt'"
      class="mb-4"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="verbindung.seit ? `Zuletzt gescheitert am ${alsDatum(verbindung.seit)}` : undefined"
      :description="verbindung.meldung ?? undefined"
    />

    <slot v-if="offen" :fertig="fertig" />

    <div v-else class="flex justify-end">
      <UButton color="neutral" variant="subtle" size="sm" @click="offen = true">
        {{ knopf }}
      </UButton>
    </div>

    <!-- Was zu dieser Datenquelle gehört, aber nicht zum Verbinden: bei Garmin die
         Erstbefüllung. Anders als das Formular immer sichtbar — sie ist gerade dann
         interessant, wenn die Verbindung schon steht. -->
    <template v-if="$slots.fuss">
      <USeparator class="my-4" />
      <slot name="fuss" />
    </template>
  </UCard>
</template>
