<script setup lang="ts">
// Der Weg zu einer Verbindung, für beide Verbindungs-Schritte der Einrichtung
// derselbe (Issue #52): ein Knopf in die Einstellungen — und dort, wo der Athlet
// schon steht, stattdessen ein Satz. Ein Knopf auf die eigene Seite ist ein
// Fehlklick in Wartestellung.
defineProps<{ inEinstellungen?: boolean }>()
</script>

<template>
  <p v-if="inEinstellungen">Die Karte dafür steht weiter unten auf dieser Seite.</p>

  <UButton v-else to="/einstellungen" color="neutral" variant="subtle" size="sm" class="self-start">
    Zu den Einstellungen
  </UButton>
</template>
