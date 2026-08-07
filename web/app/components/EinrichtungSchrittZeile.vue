<script setup lang="ts">
// Das gemeinsame Gerüst eines Einrichtungs-Schritts (Issue #52): Nummer oder Haken,
// Titel, die Marke „Optional" — darunter im Slot, was dieser Schritt zu tun gibt.
//
// Die Nummer ist eine **Empfehlung**, kein Tor: Jeder Schritt ist für sich erledigbar
// und jederzeit nachholbar, keiner wartet auf einen davor. Sie steht trotzdem da,
// weil eine Reihenfolge beim ersten Mal Arbeit abnimmt.
//
// Ein erledigter Schritt klappt seinen Körper zu und lässt nur den Haken stehen: Was
// getan ist, soll die Liste nicht länger belegen — und was noch zu tun ist, findet
// man dann ohne Suchen. Auf der Startseite ist das richtig, in den Einstellungen
// nicht: Dort ist die Liste ein **Nachschlagewerk** (`ausfuehrlich`), und wer seinen
// Connector neu aufsetzt, sucht genau die MCP-URL, die hinter dem Haken steckt.
defineProps<{
  nummer: number
  titel: string
  erledigt: boolean
  /** Überspringbar — die Marke sagt das ausdrücklich, statt es offen zu lassen. */
  optional: boolean
  /** Auch erledigte Schritte aufgeklappt lassen. */
  ausfuehrlich?: boolean
}>()
</script>

<template>
  <li class="flex gap-3 py-3">
    <div
      class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
      :class="erledigt ? 'bg-success/15 text-success' : 'bg-elevated text-muted'"
      aria-hidden="true"
    >
      <UIcon v-if="erledigt" name="i-lucide-check" class="size-4" />
      <template v-else>{{ nummer }}</template>
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="font-medium" :class="erledigt && 'text-muted'">{{ titel }}</h3>
        <UBadge v-if="optional && !erledigt" color="neutral" variant="subtle" size="sm">
          Optional
        </UBadge>
        <span v-if="erledigt" class="text-sm text-success">Erledigt</span>
      </div>

      <div
        v-if="!erledigt || ausfuehrlich"
        class="mt-2 flex flex-col gap-3 text-sm text-muted"
      >
        <slot />
      </div>
    </div>
  </li>
</template>
