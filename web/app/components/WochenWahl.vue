<script setup lang="ts">
import { wochenZeitraum } from '@shared/garmin/isoWoche'

// Die Wochen-Auswahl des Trainingsbuchs — zugleich die **Überschrift** der Seite.
//
// Vorher hing sie in der Kopfzeile: drei Kürzel („W24 W25 W26"), ein „Ältere ▾" und
// ‹ ›, eingeklemmt zwischen Flächen-Navigation und Speichern. Zwei Probleme, beide
// auf dem Handy unübersehbar: Sie passte nicht in die Zeile, und niemand las sie als
// Auswahl — Kürzel zwischen lauter Navigation sehen aus wie noch mehr Navigation.
//
// Deshalb ist die Auswahl jetzt der **Titel selbst**: Was groß oben auf der Seite
// steht („KW 26 · 22.–28. Juni"), ist ein Knopf mit Chevron und öffnet die Liste aller
// Wochen. Das ist der eine Ort, an dem man ohnehin hinsieht, um zu wissen, wo man ist —
// und dass man dort auch *wechseln* kann, sagt das Chevron ohne Erklärtext.
//
// Die Grundlagen (`/steuerung`) hängen im selben Menü statt als eigener Knopf daneben:
// Sie sind das Deckblatt desselben Buchs, nicht eine andere Fläche. So trägt das
// Trainingsbuch auf jeder seiner Seiten genau ein Bedienelement.
//
// Rein lesend — Navigation, kein Speichern.
const props = defineProps<{
  /** Alle Wochen mit Eintrag, wie sie der Store liefert (Reihenfolge egal). */
  wochen: string[]
  /** Die offene Woche; fehlt auf den Grundlagen. */
  currentKw?: string
}>()

const steuerungBase = '/steuerung'

// Store liefert kw aufsteigend; defensiv sortieren (lexikografisch = chronologisch).
const sortiert = computed(() => [...props.wochen].sort())

// „22.–28. Juni" — der Zeitraum sagt einem Athleten mehr als die Wochennummer allein:
// Wochennummern kennt kaum jemand auswendig, das Datum des letzten langen Laufs schon.
const tagMonat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })
const tag = new Intl.DateTimeFormat('de-DE', { day: 'numeric' })

function zeitraumText(kw: string): string {
  const { von, bis } = wochenZeitraum(kw)
  const montag = new Date(`${von}T00:00:00Z`)
  const sonntag = new Date(`${bis}T00:00:00Z`)
  // Innerhalb eines Monats steht der Monatsname nur einmal („22.–28. Juni"),
  // über die Monatsgrenze zweimal („29. Juni – 5. Juli").
  return montag.getUTCMonth() === sonntag.getUTCMonth()
    ? `${tag.format(montag)}.–${tagMonat.format(sonntag)}`
    : `${tagMonat.format(montag)} – ${tagMonat.format(sonntag)}`
}

/** „2026-W26" → „KW 26" — das Jahr steht im Zeitraum daneben. */
function kwKurz(kw: string): string {
  return `KW ${kw.slice(6)}`
}

const titel = computed(() =>
  props.currentKw ? `${kwKurz(props.currentKw)} · ${zeitraumText(props.currentKw)}` : 'Grundlagen',
)

// Neueste zuerst: Die aktuelle Woche ist fast immer die gesuchte, und wer weiter
// zurück will, blättert im Menü nach unten statt am Anfang der Saison zu starten.
const menue = computed(() => [
  [
    {
      label: 'Grundlagen',
      icon: 'i-lucide-target',
      to: steuerungBase,
      // Ziel, Form, Paces, Phase — das Deckblatt, nicht eine Woche.
      active: !props.currentKw,
    },
  ],
  [...sortiert.value]
    .reverse()
    .map((kw) => ({
      label: `${kwKurz(kw)} · ${zeitraumText(kw)}`,
      to: `${steuerungBase}/${kw}`,
      active: kw === props.currentKw,
    })),
])

// Blättern überspringt Lücken: Wochen ohne Eintrag stehen nicht in der Liste, und ein
// ‹, das auf eine leere Woche führt, wäre ein Klick ins Nichts.
const vorherige = computed(() =>
  props.currentKw ? [...sortiert.value].reverse().find((w) => w < props.currentKw!) : undefined,
)
const naechste = computed(() =>
  props.currentKw ? sortiert.value.find((w) => w > props.currentKw!) : undefined,
)
</script>

<template>
  <div class="mb-4 flex items-center gap-2">
    <UDropdownMenu
      :items="menue"
      :ui="{ content: 'max-h-80 overflow-auto' }"
    >
      <UButton
        color="neutral"
        variant="outline"
        trailing-icon="i-lucide-chevron-down"
        class="min-w-0 text-lg font-semibold sm:text-xl"
        aria-label="Woche wählen"
      >
        <span class="truncate">{{ titel }}</span>
      </UButton>
    </UDropdownMenu>

    <!-- Nur auf einer Wochenseite: Von den Grundlagen aus gibt es kein „vorher". -->
    <div v-if="currentKw" class="ml-auto flex shrink-0 items-center gap-1">
      <UButton
        :to="vorherige ? `${steuerungBase}/${vorherige}` : undefined"
        :disabled="!vorherige"
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="outline"
        size="sm"
        aria-label="Vorherige Woche"
      />
      <UButton
        :to="naechste ? `${steuerungBase}/${naechste}` : undefined"
        :disabled="!naechste"
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="outline"
        size="sm"
        aria-label="Nächste Woche"
      />
    </div>
  </div>
</template>
