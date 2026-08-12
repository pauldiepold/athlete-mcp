<script setup lang="ts">
// Das löchrige 30-Tage-Fenster über vorhandenen Körperdaten (Issue #67).
//
// Der Fall, den die Startseite bis dahin verschwieg: ein Archiv mit alten Daten, aber
// ein Fenster voller Lücken — Backfill von letztem Jahr, eine Uhr, die wochenlang nicht
// synchronisiert hat, eine abgebrochene Erstbefüllung. `hatKoerperdaten` sagt dazu nur
// „irgendwann kam mal etwas an", der Zustand blieb `daten`, die Kachelzeile blieb leer,
// und daneben stand nichts. Derselbe Athlet las unter `/einstellungen` „23 Tage fehlen
// noch" an einem anklickbaren Knopf.
//
// **Ein Hinweis, kein fünfter Zustand** (`zeigtLueckenHinweis`): Die Kachelzeile bleibt
// stehen. Was da ist, ist nicht falsch — es ist unvollständig, und genau das sagt der
// Hinweis darüber. Gebaut wie der Verbindungs-Hinweis, mit dem er sich den Platz teilt:
// Beide erklären, warum unter ihnen etwas fehlt.
//
// **Derselbe Knopf wie in den Einstellungen**, nicht nur ein Weg dorthin: Es ist
// dieselbe Handlung am selben Lauf, und ein Hinweis, der den Athleten für einen Klick
// erst auf eine andere Seite schickt, macht aus einer Sache zwei. Das Anstoßen gehört
// ohnehin dem geteilten Modul — die Seite wechselt daraufhin von selbst auf den
// Ladehinweis, und dieser Hinweis ist dann schon nicht mehr da.
//
// Ohne eigenen Wunsch, wie oft nachgefragt wird: Er steht nur da, solange **nichts**
// läuft, und hätte nichts zu beobachten.
const { offen, laeuftAn, fehler, anstossen } = useErstbefuellung({ takt: ref(null) })

/**
 * Der Titel nennt die **offenen** Tage, nicht die verschleppten: Gefragt wird, was ein
 * Klick zu tun hätte, und der holt jeden offenen Tag des Fensters. Die verschleppten
 * entscheiden nur, *ob* hier überhaupt jemand redet — sie als Zahl zu zeigen, hieße dem
 * Athleten das Nachlauffenster des Crons zu erklären.
 *
 * `null` (Archiv nicht lesbar) kommt hier nie an — dann zeigt die Startseite den Hinweis
 * gar nicht erst.
 */
const titel = computed(() => {
  const n = offen.value ?? 0
  return n === 1
    ? 'In den letzten 30 Tagen fehlt ein Tag'
    : `In den letzten 30 Tagen fehlen ${n} Tage`
})
</script>

<template>
  <UAlert
    class="mb-6"
    color="neutral"
    variant="subtle"
    icon="i-lucide-calendar-off"
    :title="titel"
    :description="fehler ?? 'Der nächtliche Abruf holt nur die letzten zwei Wochen nach — was älter ist, kommt nur auf deinen Anstoß hin.'"
  >
    <template #actions>
      <UButton
        color="neutral"
        variant="solid"
        size="xs"
        :loading="laeuftAn"
        @click="anstossen"
      >
        Fehlende Tage holen
      </UButton>
    </template>
  </UAlert>
</template>
