<script setup lang="ts">
// Verbunden, aber leer und es läuft nichts (Issue #51) — der einzige der drei
// datenlosen Zustände der Startseite, in dem der Athlet hier etwas tun kann.
//
// Derselbe Mechanismus wie beim Verbinden (die *Erstbefüllung* aus Issue #48), nicht
// ein zweiter, nachgebauter Pfad: Ein Hintergrundlauf hat keine Zustellgarantie, und
// dieser Knopf ist sein regulärer zweiter Versuch. Deshalb steht er hier — und nicht
// nur in den Einstellungen, wo ihn niemand sucht, der auf ein leeres Dashboard schaut.
//
// Was danach passiert, entscheidet die Startseite: Sie sieht den übernommenen Lauf im
// geteilten Stand und wechselt auf den Ladehinweis. Diese Karte kennt den laufenden Lauf
// gar nicht — sie ist dann schon nicht mehr da. Deshalb kommt der Lauf auch nicht mehr
// als Prop von oben und das Anstoßen nicht mehr als Ereignis zurück: Beides ist derselbe
// Zustand, den `useErstbefuellung` ohnehin für alle hält.
//
// Ohne eigenen Wunsch, wie oft nachgefragt wird: Die Karte steht nur da, solange gerade
// **nichts** läuft — sie hätte ohnehin nichts zu beobachten, und was sie anstößt,
// übernimmt das Modul sofort. Nachgefragt wird trotzdem, im Takt der Startseite.
const { fall, laeuftAn, fehler, anstossen } = useErstbefuellung({ takt: ref(null) })

/**
 * Der Fall kommt geteilt und geprüft (`erstbefuellungsFall`), der **Satz** gehört dieser
 * Fläche: zwei Sätze mit Überschrift, nicht die einzeilige Tonlage des Knopfs in den
 * Einstellungen.
 *
 * Bewusst **ohne** die Zahl der fehlenden Tage: Die Karte erscheint nur über einem
 * leeren Archiv, dort ist das ganze Fenster offen — „30 Tage fehlen noch" trüge nichts
 * bei, was der Text nicht schon sagt.
 */
const text = computed(() => {
  switch (fall.value) {
    case 'nie-gelaufen':
      return 'Garmin ist verbunden, aber deine Körperdaten sind noch nicht geholt worden. '
        + 'Wir holen die letzten 30 Tage — danach steht hier dein Verlauf.'
    case 'gescheitert':
      return 'Der Abruf deiner Körperdaten ist gescheitert. Ein zweiter Versuch holt sie '
        + 'nach; hält es an, stimmt vermutlich die Garmin-Verbindung nicht mehr.'
    // Durchgelaufen und trotzdem nichts im Archiv: Garmin hatte für diese Tage nichts.
    // Das als Fehler zu melden wäre falsch — es ist ein Ergebnis.
    //
    // `laeuft` und `vollstaendig` kommen hier nie an — die Startseite zeigt die Karte nur
    // im Zustand `keine-daten`, und `unvollstaendig` über einem leeren Archiv hieße
    // dasselbe wie `leer-geliefert`: Geschrieben wurde nichts.
    default:
      return 'Für die letzten 30 Tage hat Garmin nichts geliefert. Wenn deine Uhr seitdem '
        + 'synchronisiert hat, lohnt ein neuer Versuch.'
  }
})

const knopf = computed(() => (fall.value === 'nie-gelaufen' ? 'Körperdaten holen' : 'Noch einmal holen'))
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">Noch keine Körperdaten</h2>
    </template>

    <!-- Nach einem Fehlschlag bleibt die Karte stehen und zeigt statt ihres Textes die
         Meldung — dort, wo der Athlet gerade hingedrückt hat. -->
    <p class="text-sm text-muted">{{ fehler ?? text }}</p>

    <UButton class="mt-4" :loading="laeuftAn" @click="anstossen">{{ knopf }}</UButton>
  </UCard>
</template>
