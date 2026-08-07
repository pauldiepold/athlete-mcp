<script setup lang="ts">
import { hinweisDesTages } from '#shared/chatHinweise'
import { heuteInBerlin } from '@shared/zeitzone'

// Der obere Block der Startseite (Issue #60): **ein** Hinweis, was sich jetzt in Claude
// machen lässt, samt fertigem Satz zum Kopieren.
//
// Warum genau einer und warum aus einer statischen Liste, steht bei der Liste selbst
// (`shared/chatHinweise.ts`). Hier steht nur, wie er aussieht — und die eine Entscheidung
// der Fläche: Er ist die **erste** Sache auf der Seite, sobald die Einrichtung steht.
// Das ist der sichtbare Lohn fürs Fertigwerden; vorher stand dort die Einrichtung, und
// beides nebeneinander wäre wieder ein Menü.
//
// Der Tag kommt aus `heuteInBerlin` und nicht aus der lokalen Zeitzone des Browsers:
// Dieselbe Definition von „heute" wie überall sonst, und damit rechnen Server und
// Client denselben Hinweis aus — sonst tauschte die Hydration den Text aus.
const hinweis = computed(() => hinweisDesTages(heuteInBerlin()))

const { kopiert, kopieren } = useKopieren(() => hinweis.value.satz)
</script>

<template>
  <UCard>
    <div class="flex gap-3">
      <UIcon name="i-lucide-message-circle" class="mt-0.5 size-5 shrink-0 text-dimmed" />

      <div class="min-w-0 flex-1">
        <!-- Die Zeile darüber sagt, dass das hier kein Bericht ist, sondern ein
             Vorschlag — ohne sie läse sich die Überschrift wie eine Aufgabe, die
             jemand vergeben hat. -->
        <p class="text-xs font-medium text-dimmed uppercase">Heute in Claude</p>
        <h2 class="mt-1 font-semibold">{{ hinweis.titel }}</h2>
        <p class="mt-1 text-sm text-muted">{{ hinweis.text }}</p>

        <!-- Der Satz steht im Klartext und nicht nur hinter dem Knopf: Er landet in
             einem anderen Fenster, und wer dort merkt, dass nichts eingefügt wurde,
             muss ihn ablesen können (dieselbe Linie wie bei KopierZeile). -->
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <p class="min-w-0 flex-1 rounded-md bg-elevated px-3 py-2 text-sm italic">
            „{{ hinweis.satz }}“
          </p>

          <UButton
            color="neutral"
            variant="subtle"
            size="sm"
            :icon="kopiert ? 'i-lucide-check' : 'i-lucide-copy'"
            aria-label="Satz für Claude kopieren"
            @click="kopieren"
          >
            {{ kopiert ? 'Kopiert' : 'Kopieren' }}
          </UButton>
        </div>
      </div>
    </div>
  </UCard>
</template>
