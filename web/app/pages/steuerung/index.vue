<script setup lang="ts">
// Steuerungs-Startseite (Issue #13/#16): der Steuerungsplan selbst — lesen und per Toggle in
// der Seite bearbeiten. Delegiert View/Edit samt Gerüst an SteuerungDoc (geteilt mit der
// Wochen-Seite); die Wochen-Navigation liegt in der Kopfzeile (Shortcuts + „Ältere").
const { data } = await useFetch('/api/steuerung/plan')

useHead({ title: 'Steuerungsplan' })
</script>

<template>
  <SteuerungDoc
    :wochen="data?.wochen ?? []"
    title="Steuerungsplan"
    endpoint="/api/steuerung/plan"
    placeholder="# Steuerungsplan…"
    :initial-markdown="data?.markdown ?? ''"
  />
</template>
