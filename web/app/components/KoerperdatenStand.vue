<script setup lang="ts">
import { ZEITRAEUME, ZEITRAUM_STANDARD } from '#shared/zeitraum'

// Der Körperdaten-Block der **Startseite** (Issue #60): die Kachelzeile und ein Weg zu
// den Verläufen — mehr nicht.
//
// Bis Issue #60 war die Startseite das Dashboard, mit sieben Charts und der
// Wochenliste. Das war die falsche Ansage: Zentrum des Produkts ist das Gespräch, und
// wer nach dem Login vor sieben Charts landet, liest die Seite als Chart-Produkt. Der
// aktuelle Stand bleibt trotzdem hier — er beantwortet die eine Frage, die man beim
// Öffnen hat („wo stehe ich gerade"), und für alles Weitere steht der Weg darunter.
//
// **Eigener Abruf mit eigenem Key**, nicht der der Verläufe: Dort folgt der Zeitraum
// der URL, hier ist er immer der Standard. Auf demselben Key läge nach einem Wechsel
// von hier nach `/dashboard` erst der Startseiten-Ausschnitt in den Charts, bis der
// Query-Watcher nachzieht — ein sichtbar falscher Zeitraum für einen Frame.
const { data } = useFetch('/api/koerperdaten/serien', {
  key: 'koerperdaten-serien-start',
  query: { zeitraum: ZEITRAUM_STANDARD },
})

// Die Zahl im Untertitel kommt aus derselben Konstante wie der Abruf: Sonst behauptet
// die Zeile „30 Tage", sobald jemand den Standard-Ausschnitt anfasst, und die
// Kachelzeile zeigt etwas anderes. „Alles" hat keine Tageszahl — dann bleibt der
// Satz allgemein.
const fensterTage = ZEITRAEUME[ZEITRAUM_STANDARD]
const untertitel = fensterTage === null
  ? 'Dein ganzer Verlauf, auf einen Blick.'
  : `Die letzten ${fensterTage} Tage, auf einen Blick.`
</script>

<template>
  <section v-if="data">
    <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="font-semibold">Dein Stand</h2>
        <p class="text-sm text-muted">{{ untertitel }}</p>
      </div>

      <!-- Der Weg zu den Verläufen steht **neben der Überschrift** und nicht als
           Fußzeile unter den Kacheln: Er ist der zweite Zweck dieses Blocks, und
           unter acht Kacheln fände ihn auf dem Handy niemand. -->
      <UButton
        to="/dashboard"
        color="neutral"
        variant="subtle"
        size="sm"
        trailing-icon="i-lucide-arrow-right"
      >Alle Verläufe</UButton>
    </div>

    <KoerperdatenKacheln
      :index="data.index"
      :kennzahlen="data.kennzahlen"
      :serien="data.serien"
    />
  </section>
</template>
