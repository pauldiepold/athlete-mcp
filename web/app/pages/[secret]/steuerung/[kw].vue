<script setup lang="ts">
import { isValidKw } from '@shared/steuerung/steuerungStore'

// Eine Woche im Browser lesen + editieren (Issue #13): lädt das Markdown und delegiert
// View/Edit-Toggle samt Gerüst an SteuerungDoc (#16, geteilt mit dem Steuerungsplan). Eine
// noch nicht existierende kw wird durch Speichern angelegt (Last-Write-Wins, ADR-0004).
const route = useRoute()
const secret = route.params.secret as string
const kw = route.params.kw as string

// Ungültiges kw-Format gar nicht erst laden (^\d{4}-W\d{2}$, wie der Store).
if (!isValidKw(kw)) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

const { data, error } = await useFetch(`/api/${secret}/steuerung/woche/${kw}`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

useHead({
  title: data.value?.user ? `${kw} · ${data.value.user}` : kw,
})
</script>

<template>
  <SteuerungDoc
    :user="data?.user ?? ''"
    :secret="secret"
    :wochen="data?.wochen ?? []"
    :current-kw="kw"
    :title="kw"
    :endpoint="`/api/${secret}/steuerung/woche/${kw}`"
    :placeholder="`# ${kw}…`"
    :initial-markdown="data?.markdown ?? ''"
  />
</template>
