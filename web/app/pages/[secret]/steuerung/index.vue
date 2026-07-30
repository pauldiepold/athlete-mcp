<script setup lang="ts">
// Steuerungs-Startseite (Issue #13/#16): der Steuerungsplan selbst — lesen und per Toggle in
// der Seite bearbeiten. Delegiert View/Edit samt Gerüst an SteuerungDoc (geteilt mit der
// Wochen-Seite); die Wochen-Navigation liegt in der Kopfzeile (Shortcuts + „Ältere").
const route = useRoute()
const secret = route.params.secret as string

const { data, error } = await useFetch(`/api/${secret}/steuerung/plan`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

useHead({
  title: data.value?.user ? `Steuerungsplan · ${data.value.user}` : 'Steuerungsplan',
})
</script>

<template>
  <SteuerungDoc
    :user="data?.user ?? ''"
    :secret="secret"
    :wochen="data?.wochen ?? []"
    title="Steuerungsplan"
    :endpoint="`/api/${secret}/steuerung/plan`"
    placeholder="# Steuerungsplan…"
    :initial-markdown="data?.markdown ?? ''"
  />
</template>
