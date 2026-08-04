<script setup lang="ts">
// Öffentliche Startseite und Ziel nach dem Abmelden (Issue #14, ADR-0005). Bewusst
// ohne Session-Zwang und ohne Inhalt: wer hier landet, hat entweder seinen
// persönlichen Link (dann führt der direkt in seine Fläche) oder ist der Betreiber —
// für den steht der Weg zurück im Header (Admin) bzw. im Footer (Login).
useHead({ title: 'athlete-mcp' })
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AppHeader />

    <UContainer class="flex w-full flex-1 flex-col items-center justify-center py-20 text-center">
      <h1 class="text-xl font-semibold">athlete-mcp</h1>
      <p class="mt-2 max-w-md text-sm text-muted">
        Persönliche Fläche für Körperdaten und Trainingssteuerung. Der Zugang läuft über
        den persönlichen Link.
      </p>
    </UContainer>
  </div>
</template>
