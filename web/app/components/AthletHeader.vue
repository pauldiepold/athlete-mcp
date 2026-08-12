<script setup lang="ts">
// Kopfzeile aller Athleten-Seiten (Issue #13, erweitert in #24) — trägt die
// Navigation, damit sie beim Scrollen immer erreichbar bleibt. Das sticky Gerüst und
// das Konto-Menü kommen aus AppHeader; hier die athletenspezifischen Zonen:
//   links  – Umschalter zwischen Körperdaten und Trainingsbuch
//            (der Kontext heißt im Repo weiter `steuerung`, siehe src/steuerung/CONTEXT.md)
//   rechts – Actions-Slot (z. B. Speichern), nur im Edit-Kontext gefüllt
//
// **Zwei Knöpfe statt drei:** „Start" ist verschwunden, weil die Wortmarke links
// bereits nach `/` führt — zwei Wege zur selben Fläche, nebeneinander in derselben
// Leiste. Die Wortmarke ist der Start und wird auf ihm hervorgehoben (`startAktiv`).
//
// **Auf dem Handy steht hier gar keine Navigation.** Der erste Versuch ließ die zwei
// Knöpfe auf ihre Icons schrumpfen, damit die Leiste bei 375 px nicht umbricht — und
// verlangte damit, dass man Notizblock und Pulslinie ohne Wort errät. Bis `sm`
// übernimmt jetzt AthletTabLeiste am unteren Rand, wo Icon *und* Wort passen; hier
// bleiben nur Wortmarke, Actions und Konto. Ab `sm` ist Platz für die beschrifteten
// Knöpfe, und die untere Leiste verschwindet.
//
// **Die Wochen-Navigation ist hier raus** (früher: drei Chips, ein „Ältere"-Dropdown
// und ‹ › zwischen den Flächen und dem Speichern). Sie steht jetzt als eigene Leiste
// im Trainingsbuch selbst — siehe WochenWahl. In der Kopfzeile war sie auf dem Handy
// weder unterzubringen noch als Auswahl zu erkennen: drei Kürzel wie „W24 W25 W26"
// zwischen lauter Navigation liest niemand als „hier wählst du deine Woche".
//
// Athlet-Identität und Abmelden standen bis ADR-0007 hier links; seit die Anmeldung
// eine Session ist statt eines Secrets in der URL, gehören sie ins Konto-Menü rechts —
// dorthin, wo sie auf jeder Fläche gleich zu finden sind.
const props = defineProps<{
  /**
   * Welche Fläche gerade offen ist — steuert den Umschalter.
   *
   * `einstellungen` hebt bewusst **keinen** der Knöpfe hervor: Die Einstellungen sind
   * keine tägliche Fläche, sondern hängen im Konto-Menü rechts. Die Kopfzeile
   * trägt sie trotzdem, damit von dort der Weg zurück auf einen Klick geht.
   */
  bereich: Bereich
}>()

// Die Flächen selbst stehen in app/utils/flaechen.ts — dieselbe Liste, aus der die
// Tab-Leiste ihre Tabs baut.
const flaechen = ATHLET_FLAECHEN

const startAktiv = computed(() => props.bereich === 'start')
</script>

<template>
  <AppHeader :start-aktiv="startAktiv">
    <nav class="hidden items-center gap-1 sm:flex" aria-label="Hauptnavigation">
      <UButton
        v-for="f in flaechen"
        :key="f.bereich"
        :to="f.to"
        :icon="f.icon"
        :color="bereich === f.bereich ? 'primary' : 'neutral'"
        :variant="bereich === f.bereich ? 'soft' : 'ghost'"
        size="sm"
      >
        {{ f.label }}
      </UButton>
    </nav>

    <template #actions>
      <slot name="actions" />
    </template>
  </AppHeader>
</template>
