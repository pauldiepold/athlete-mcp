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
// Leiste. Auf dem Handy war das der teuerste der drei Punkte: Wortmarke, drei
// Knöpfe und das Konto-Menü passten nicht in eine Zeile, die Leiste brach um. Die
// Wortmarke ist jetzt der Start und wird auf ihm hervorgehoben (`startAktiv`).
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
  bereich: 'start' | 'koerperdaten' | 'steuerung' | 'einstellungen'
}>()

/**
 * Die beiden täglichen Flächen (Issue #60).
 *
 * **Deutsch, weil der Rest der Oberfläche deutsch ist**: „Körperdaten" statt
 * „Dashboard" — das ist der Inhalt, während „Dashboard" nur ein Fremdwort für
 * dasselbe wäre. Der *Pfad* heißt trotzdem weiter `/dashboard`: Pfade liest niemand
 * vor, und ein Umbenennen bräche jeden geteilten Link.
 *
 * Jede Fläche hat ein Icon, weil auf schmalen Geräten nur das Icon stehen bleibt:
 * Zwei Wörter dieser Länge plus Wortmarke plus Konto passen bei 375 px nicht in eine
 * Zeile. Das `aria-label` trägt den Namen weiter, auch wenn er nicht zu sehen ist.
 */
const flaechen = [
  { bereich: 'koerperdaten', label: 'Körperdaten', icon: 'i-lucide-activity', to: '/dashboard' },
  { bereich: 'steuerung', label: 'Trainingsbuch', icon: 'i-lucide-notebook-pen', to: '/steuerung' },
] as const

const startAktiv = computed(() => props.bereich === 'start')
</script>

<template>
  <AppHeader :start-aktiv="startAktiv">
    <nav class="flex items-center gap-1" aria-label="Hauptnavigation">
      <UButton
        v-for="f in flaechen"
        :key="f.bereich"
        :to="f.to"
        :icon="f.icon"
        :aria-label="f.label"
        :color="bereich === f.bereich ? 'primary' : 'neutral'"
        :variant="bereich === f.bereich ? 'soft' : 'ghost'"
        size="sm"
      >
        <span class="hidden sm:inline">{{ f.label }}</span>
      </UButton>
    </nav>

    <template #actions>
      <slot name="actions" />
    </template>
  </AppHeader>
</template>
