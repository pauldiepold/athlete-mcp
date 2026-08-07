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
//
// Der Zustand ist **Text und kein Abzeichen**. Als gefüllte Pille in Knopfgröße oben
// rechts sah „− Nicht verbunden" aus wie der Knopf, mit dem man verbindet, und wurde
// auch so angeklickt (beobachtet bei einem Nutzer); der echte Knopf stand unten rechts
// am anderen Ende der Karte. Jetzt steht der Knopf direkt neben dem Zustand: An der
// Stelle, an die die Hand ohnehin geht, liegt das, was sie sucht — und was nur meldet,
// sieht auch nur wie eine Meldung aus.
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

const zustandsAnzeige = computed(() => {
  switch (props.verbindung.zustand) {
    case 'verbunden':
      return { label: 'Verbunden', klasse: 'text-success', icon: 'i-lucide-check-circle-2' }
    case 'kaputt':
      return { label: 'Unterbrochen', klasse: 'text-error', icon: 'i-lucide-triangle-alert' }
    default:
      return { label: 'Nicht verbunden', klasse: 'text-muted', icon: 'i-lucide-circle-dashed' }
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

const slots = useSlots()

/** Hat der Körper überhaupt etwas zu zeigen? */
const koerperGefuellt = computed(
  () => offen.value || props.verbindung.zustand === 'kaputt' || !!slots.fuss,
)
</script>

<template>
  <!-- Ohne Inhalt auch keine Polsterung: Eine zugeklappte, heile Verbindung ohne Fuß
       hinterließe sonst einen leeren Streifen unter dem Kopf, der aussieht, als wäre
       dort etwas nicht geladen. -->
  <UCard :ui="koerperGefuellt ? undefined : { body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="font-semibold">{{ verbindung.name }}</h3>
          <p class="text-sm text-muted">{{ wofuer }}</p>
        </div>
        <div class="flex items-center gap-3">
          <span
            class="flex items-center gap-1.5 text-sm font-medium"
            :class="zustandsAnzeige.klasse"
          >
            <UIcon :name="zustandsAnzeige.icon" class="size-4" />
            {{ zustandsAnzeige.label }}
          </span>

          <!-- Der Knopf steht neben dem Zustand und nicht unter der Karte: Wer den
               Zustand liest, will genau hier handeln. Offen wird er zum Weg zurück —
               sonst gäbe es keinen, sobald das Formular einmal aufgeklappt ist. -->
          <UButton
            v-if="!offen"
            color="neutral"
            variant="subtle"
            size="sm"
            @click="offen = true"
          >
            {{ knopf }}
          </UButton>
          <UButton
            v-else-if="verbindung.zustand === 'verbunden'"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="offen = false"
          >
            Abbrechen
          </UButton>
        </div>
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

    <!-- Zugeklappt bleibt der Körper leer: Der Knopf steht oben beim Zustand, und eine
         zweite Fläche für dieselbe Handlung wäre nur die Frage, welche gilt. -->

    <!-- Was zu dieser Datenquelle gehört, aber nicht zum Verbinden: bei Garmin die
         Erstbefüllung. Anders als das Formular immer sichtbar — sie ist gerade dann
         interessant, wenn die Verbindung schon steht. -->
    <template v-if="$slots.fuss">
      <!-- Der Trenner nur, wenn über ihm etwas steht — sonst begänne der Körper mit
           einem Strich direkt unter dem Kopf. -->
      <USeparator v-if="offen || verbindung.zustand === 'kaputt'" class="my-4" />
      <slot name="fuss" />
    </template>
  </UCard>
</template>
