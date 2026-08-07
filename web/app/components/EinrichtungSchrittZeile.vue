<script setup lang="ts">
// Das gemeinsame Gerüst eines Einrichtungs-Schritts (Issue #52): Nummer oder Haken,
// Titel, die Marke „Optional" — darunter im Slot, was dieser Schritt zu tun gibt.
//
// Die Nummer ist eine **Empfehlung**, kein Tor: Jeder Schritt ist für sich erledigbar
// und jederzeit nachholbar, keiner wartet auf einen davor. Sie steht trotzdem da,
// weil eine Reihenfolge beim ersten Mal Arbeit abnimmt.
//
// Die Zeile ist **aufklappbar**, und der ganze Kopf ist der Schalter. Vorher entschied
// allein die Liste, was offen steht (`aufgeklappt`): Auf der Startseite genau der
// nächste offene Pflichtschritt — womit „Garmin verbinden" dort als Titel ohne Körper
// stand. Ein Schritt, den man nicht öffnen kann, benennt eine Aufgabe, ohne zu sagen,
// was zu tun ist. `aufgeklappt` ist deshalb nur noch der **Anfangszustand**; wer eine
// andere Zeile aufmacht, bekommt sie.
//
// Kein Akkordeon mit nur einem offenen Schritt: Die Zeilen sind unabhängig, und wer
// die MCP-URL neben der Anleitung darüber sehen will, soll das dürfen.
const props = defineProps<{
  nummer: number
  titel: string
  erledigt: boolean
  /** Überspringbar — die Marke sagt das ausdrücklich, statt es offen zu lassen. */
  optional: boolean
  /** Anfangszustand: Ist der Körper dieses Schritts sichtbar? */
  aufgeklappt: boolean
}>()

const offen = ref(props.aufgeklappt)

// Der Anfangszustand kommt aus abgeleiteten Daten und steht beim ersten Rendern noch
// auf dem Default „alles fehlt" — er darf die Zeile deshalb nachträglich noch öffnen.
// Eine Zeile, die der Athlet selbst aufgemacht hat, bleibt davon unberührt: zugeklappt
// wird hier nie, das entscheidet nur der Klick.
watch(() => props.aufgeklappt, (jetzt) => {
  if (jetzt) offen.value = true
})
</script>

<template>
  <li class="py-3">
    <button
      type="button"
      class="flex w-full gap-3 text-left"
      :aria-expanded="offen"
      @click="offen = !offen"
    >
      <div
        class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
        :class="erledigt ? 'bg-success/15 text-success' : 'bg-elevated text-muted'"
        aria-hidden="true"
      >
        <UIcon v-if="erledigt" name="i-lucide-check" class="size-4" />
        <template v-else>{{ nummer }}</template>
      </div>

      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <!-- Eine Überschrift wäre hier falsch ausgezeichnet: `<h3>` ist Fluss- und
             keine Phrasen-Auszeichnung und darf nicht in einem `<button>` stehen. Die
             Struktur trägt die Liste (`ul`/`li`) samt `aria-expanded`. -->
        <span class="font-medium" :class="erledigt && 'text-muted'">{{ titel }}</span>
        <UBadge v-if="optional && !erledigt" color="neutral" variant="subtle" size="sm">
          Optional
        </UBadge>
        <span v-if="erledigt" class="text-sm text-success">Erledigt</span>
      </div>

      <UIcon
        name="i-lucide-chevron-down"
        class="mt-1 size-4 shrink-0 text-muted transition-transform"
        :class="offen && 'rotate-180'"
      />
    </button>

    <div v-if="offen" class="mt-2 flex flex-col gap-3 pl-9 text-sm text-muted">
      <slot />
    </div>
  </li>
</template>
