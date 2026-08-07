<script setup lang="ts">
// Steuerungs-Startseite (Issue #13/#16): der Steuerungsplan selbst — lesen und per Toggle in
// der Seite bearbeiten. Delegiert View/Edit samt Gerüst an SteuerungDoc (geteilt mit der
// Wochen-Seite); die Wochen-Navigation liegt in der Kopfzeile (Shortcuts + „Ältere").
//
// Am Nutzer heißt er seit Issue #59 **Grundlagen** — was länger gilt: Ziel, Form,
// Paces, Phase. Route, Store und Repo-Sprache bleiben `steuerung`/Steuerungsplan.
const { data } = await useFetch('/api/steuerung/plan')

useHead({ title: 'Grundlagen' })
</script>

<template>
  <SteuerungDoc
    :wochen="data?.wochen ?? []"
    endpoint="/api/steuerung/plan"
    placeholder="# Grundlagen…"
    :initial-markdown="data?.markdown ?? ''"
  />
</template>
