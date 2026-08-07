<script setup lang="ts">
// Der Weg zu einer Verbindung, für beide Verbindungs-Schritte der Einrichtung
// derselbe (Issue #52).
//
// Auf der Startseite steht das **Formular selbst** im Schritt. Vorher stand hier ein
// Knopf in die Einstellungen: Der Schritt benannte eine Aufgabe, ohne sie erledigbar
// zu machen — der Athlet landete auf einer fremden Seite und musste dort die Karte
// suchen, die zu der Zeile gehörte, die er gerade gelesen hatte.
//
// Aufgeklappt wird nicht hier, sondern von der Zeile: Wer den Schritt öffnet, will
// ihn machen. Nur wenn die Verbindung schon **steht**, liegt das Formular noch einmal
// hinter „Neu verbinden" — ein leeres Passwortfeld unter einem Haken liest sich, als
// fehlte noch etwas.
//
// In den Einstellungen bleibt es beim Satz: Dort steht die Verbindungs-Karte mit
// demselben Formular weiter unten auf derselben Seite, und zweimal dasselbe
// Passwortfeld übereinander ist schlimmer als ein Verweis.
defineProps<{
  inEinstellungen?: boolean
  /** Steht die Verbindung schon? Dann ist das Formular ein *Neu*-Verbinden. */
  erledigt: boolean
}>()

const emit = defineEmits<{ fertig: [] }>()

/** Nur für den Fall „steht schon": der zweite Klick bis zum Formular. */
const neuVerbinden = ref(false)

function fertig() {
  neuVerbinden.value = false
  emit('fertig')
}
</script>

<template>
  <p v-if="inEinstellungen">Die Karte dafür steht weiter unten auf dieser Seite.</p>

  <template v-else-if="!erledigt || neuVerbinden">
    <div class="rounded-lg border border-default p-4">
      <slot :fertig="fertig" />
    </div>

    <UButton
      v-if="neuVerbinden"
      color="neutral"
      variant="ghost"
      size="sm"
      class="self-start"
      @click="neuVerbinden = false"
    >
      Abbrechen
    </UButton>
  </template>

  <UButton
    v-else
    color="neutral"
    variant="subtle"
    size="sm"
    class="self-start"
    @click="neuVerbinden = true"
  >
    Neu verbinden
  </UButton>
</template>
