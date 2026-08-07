<script setup lang="ts">
import { isValidKw } from '@shared/steuerung/steuerungStore'

// Eine Woche im Browser lesen + editieren (Issue #13): lädt das Markdown und delegiert
// View/Edit-Toggle samt Gerüst an SteuerungDoc (#16, geteilt mit dem Steuerungsplan). Eine
// noch nicht existierende kw wird durch Speichern angelegt (Last-Write-Wins, ADR-0004).
const route = useRoute()
const kw = route.params.kw as string

// Ungültiges kw-Format gar nicht erst laden (^\d{4}-W\d{2}$, wie der Store).
if (!isValidKw(kw)) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

const { data } = await useFetch(`/api/steuerung/woche/${kw}`)

useHead({ title: kw })

// Der Körperdaten-Streifen (Issue #28, Richtung 2 der Steuerungs-Brücke): eigener,
// nicht blockierender Fetch — misslingt er, bleibt die Steuerung trotzdem lesbar und
// editierbar, das ist hier die Hauptsache. Eine Woche ohne Körperdaten liefert
// `wochen: []`; der Streifen zeigt dann seine Platzhalter, kein Fehler.
const { data: koerperdatenData } = await useFetch('/api/koerperdaten/wochen', {
  query: { kw },
})
</script>

<template>
  <SteuerungDoc
    :wochen="data?.wochen ?? []"
    :current-kw="kw"
    :title="kw"
    :endpoint="`/api/steuerung/woche/${kw}`"
    :placeholder="`# ${kw}…`"
    :initial-markdown="data?.markdown ?? ''"
  >
    <template #vor-dokument>
      <KoerperdatenStreifen :kw="kw" :woche="koerperdatenData?.wochen?.[0]" />
    </template>
  </SteuerungDoc>
</template>
