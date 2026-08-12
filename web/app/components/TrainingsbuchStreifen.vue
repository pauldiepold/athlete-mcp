<script setup lang="ts">
import { isoWoche } from '@shared/garmin/isoWoche'
import { heuteInBerlin } from '@shared/zeitzone'
import { wochenAuszug } from '#shared/wochenAuszug'
import { wochenTitel } from '#shared/wochenTitel'

// Der Weg von der Startseite in die **laufende Woche** des Trainingsbuchs — das
// Gegenstück zum KoerperdatenStreifen, der aus der Woche zurück in die Körperdaten
// führt (Issue #28, Richtung 2). Bis hierher war die Brücke einseitig: Aus dem
// Trainingsbuch kam man in die Körperdaten, von der Startseite ins Trainingsbuch aber
// nur über die Navigation — und die landet auf den Grundlagen, nicht in dieser Woche.
//
// **Welche Woche, entscheidet die Uhr, nicht der Athlet.** Die Startseite ist die
// Fläche für „jetzt gerade"; die aktuelle Woche ist deshalb der einzig sinnvolle
// Sprung. Wer eine andere sucht, wählt sie drüben im Titel-Menü (WochenWahl) — hier
// noch eine Auswahl anzubieten, machte aus einem Weg ein zweites Menü.
//
// Der Tag kommt aus `heuteInBerlin` und nicht aus der Browser-Zeitzone: dieselbe
// Definition von „heute" wie überall, und damit rechnen Server und Client dieselbe
// Woche — sonst tauschte die Hydration die Kalenderwoche aus.
const kw = isoWoche(heuteInBerlin())

// **Nicht der Wochen-Aggregat-Endpunkt, sondern der Store-Read.** Der Streifen im
// Trainingsbuch braucht Körperdaten, dieser hier nur den Eintrag; `/api/steuerung/woche`
// ist ein D1-Read statt 34 Tagen Archiv plus Serienrechnung — auf der Fläche, die nach
// dem Login als erstes lädt, ist das der Unterschied, den man sieht.
//
// Ein eigener Key, damit der Abruf nicht mit dem der Wochenseite kollidiert (dort
// hängt an derselben URL das volle Dokument des Editors). Misslingt er, bleibt der
// Streifen als reiner Link stehen — der Weg ins Trainingsbuch ist die Hauptsache, der
// Auszug die Zugabe.
const { data } = await useFetch(`/api/steuerung/woche/${kw}`, {
  key: `steuerung-woche-aktuell-${kw}`,
})

const auszug = computed(() => wochenAuszug(data.value?.markdown ?? ''))
</script>

<template>
  <!-- Feste Höhe wie beim Streifen drüben: Der Auszug kommt einen Tick später, und
       ohne feste Zeile ruckte darunter der ganze Körperdaten-Block. -->
  <div
    class="mt-3 flex h-14 items-center gap-3 rounded-lg border border-default bg-elevated/50 px-3 text-sm sm:gap-4 sm:px-4"
  >
    <UIcon name="i-lucide-notebook-pen" class="size-5 shrink-0 text-dimmed" />

    <div class="flex min-w-0 flex-1 items-baseline gap-2">
      <span class="shrink-0 font-medium">{{ wochenTitel(kw) }}</span>

      <!-- Der Auszug sagt, ob in dieser Woche schon etwas steht — ohne ihn wäre der
           Streifen ein Knopf, der immer gleich aussieht, egal ob die Woche voll oder
           leer ist. Auf dem Handy hat er keinen Platz und entfällt; der Weg bleibt. -->
      <span class="hidden min-w-0 truncate text-muted sm:inline">
        <template v-if="auszug">{{ auszug }}</template>
        <template v-else>Noch nichts notiert</template>
      </span>
    </div>

    <UButton
      :to="`/steuerung/${kw}`"
      color="neutral"
      variant="ghost"
      size="xs"
      class="shrink-0"
    >
      Trainingsbuch ›
    </UButton>
  </div>
</template>
