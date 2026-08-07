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
//
// **Der Abschluss ist ein eigener Zustand** (und deshalb nimmt dieser Weg das
// Nachziehen als Funktion entgegen statt es als Ereignis abzuschicken): Wer bei Garmin
// gerade seinen Bestätigungscode eingelöst hatte, sah danach wieder das leere
// Anmeldeformular — das Formular fällt auf seinen ersten Schritt zurück, während oben
// noch der Zustand nachgeladen wird. Es hatte geklappt, sah aber aus wie ein
// Fehlschlag, und der nächste Versuch ging gegen ein Konto, das längst verbunden war.
// Jetzt endet das Formular in „geschafft" und nicht in sich selbst.
const props = defineProps<{
  inEinstellungen?: boolean
  /** Steht die Verbindung schon? Dann ist das Formular ein *Neu*-Verbinden. */
  erledigt: boolean
  /**
   * Was nach dem Verbinden nachgezogen wird. Wird **abgewartet** — solange es läuft,
   * steht hier der Spinner statt eines Formulars.
   */
  aktualisieren: () => Promise<void>
  /** Was danach gilt: ein Satz, der die Verbindung bestätigt. */
  erfolg: string
}>()

/** Nur für den Fall „steht schon": der zweite Klick bis zum Formular. */
const neuVerbinden = ref(false)

const stand = ref<'formular' | 'aktualisiert' | 'geschafft'>('formular')

async function fertig() {
  stand.value = 'aktualisiert'
  try {
    await props.aktualisieren()
  } finally {
    // Auch wenn das Nachziehen scheitert, ist die Verbindung hergestellt — der Weg
    // zurück ins Formular wäre eine Lüge über etwas, das der Server längst gespeichert
    // hat. Was der Zustand oben zeigt, holt der Abfrage-Takt der Startseite nach.
    stand.value = 'geschafft'
    neuVerbinden.value = false
  }
}

/** Nach dem Abschluss doch noch einmal von vorn — etwa nach einem Passwortwechsel. */
function nochEinmal() {
  stand.value = 'formular'
  neuVerbinden.value = true
}
</script>

<template>
  <p v-if="inEinstellungen">Die Karte dafür steht weiter unten auf dieser Seite.</p>

  <!-- Zwischen dem letzten Klick und dem nachgezogenen Zustand liegt ein Moment, in
       dem sonst nichts von dem stünde, was gerade passiert ist. -->
  <div
    v-else-if="stand === 'aktualisiert'"
    class="flex items-center gap-2 rounded-lg border border-default p-4"
  >
    <UIcon name="i-lucide-loader-circle" class="size-5 shrink-0 animate-spin" />
    <p>Geschafft — wir schließen die Verbindung gerade ab.</p>
  </div>

  <template v-else-if="stand === 'geschafft'">
    <UAlert
      color="success"
      variant="subtle"
      icon="i-lucide-check-circle-2"
      title="Verbunden"
      :description="erfolg"
    />

    <!-- Was jetzt im Hintergrund läuft, sagt der Schritt selbst — bei Garmin ist das
         die Erstbefüllung, die sich noch minutenlang bewegt, nachdem das Formular hier
         fertig ist. -->
    <slot name="nachlauf" />

    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      class="self-start"
      @click="nochEinmal"
    >
      Neu verbinden
    </UButton>
  </template>

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
