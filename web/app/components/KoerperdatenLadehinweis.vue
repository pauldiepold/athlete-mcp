<script setup lang="ts">
// „Wird gerade geholt" auf der Startseite (Issue #51) — der Zustand zwischen dem
// Verbinden und dem ersten vollen Dashboard.
//
// Bewusst **ohne Knopf**: Solange der Lauf läuft, gibt es nichts anzustoßen, und ein
// Knopf daneben provozierte genau den Doppelklick gegen ein rate-limitiertes Garmin,
// den die Reservierung der Erstbefüllung mühsam abfängt.
//
// Derselbe Hinweis steht über schon vorhandenen Tagen wie über der leeren Fläche: Was
// er sagt, ist beide Male dasselbe — es kommt noch etwas nach.
defineProps<{
  /** Ob unter dem Hinweis bereits Verläufe stehen; ändert nur den zweiten Satz. */
  mitDaten?: boolean
}>()
</script>

<template>
  <UAlert
    class="mb-6"
    color="neutral"
    variant="subtle"
    title="Deine Körperdaten werden geholt"
  >
    <!-- Der Spinner steht im `leading`-Slot statt als `icon`-Prop: Er dreht sich, und
         dieser Hinweis lebt genau davon, dass man ihm ansieht, dass etwas läuft. -->
    <template #leading>
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
    </template>

    <template #description>
      Wir holen gerade die letzten 30 Tage aus Garmin — das dauert etwa eine Minute.
      {{
        mitDaten
          ? 'Was schon da ist, siehst du unten; der Rest kommt von selbst dazu.'
          : 'Die Seite zeigt deine Verläufe, sobald die ersten Tage da sind.'
      }}
    </template>
  </UAlert>
</template>
