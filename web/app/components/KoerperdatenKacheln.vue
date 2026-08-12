<script setup lang="ts">
// Die Kachelzeile: der aktuelle Stand in acht Zahlen (Issue #24/#25).
//
// Seit Issue #60 eine eigene Komponente, weil sie an **zwei** Stellen steht: auf der
// Startseite als der ganze Körperdaten-Block, und auf `/dashboard` als Kopf über den
// Verläufen. Zweimal denselben Grid abzuschreiben hieße, dass die Startseite die
// Reihenfolge der Marker verliert, sobald jemand unten einen ergänzt.
//
// Sie bleibt dumm und ohne eigenen Abruf: Wer sie zeigt, bringt die Serien mit — die
// Startseite über ihren Standard-Zeitraum, das Dashboard über den Umschalter.
import type { KoerperdatenIndex } from '@shared/garmin/koerperdatenIndex'
import type { Kennzahlen, KoerperdatenSerien } from '@shared/garmin/koerperdatenSerien'

// Die drei Teile der Serien-Antwort einzeln statt als ein `daten`-Objekt: Damit hängt
// die Kachelzeile an den gerechneten Modulen und nicht an der Form eines Endpunkts —
// und ein Aufrufer sieht am Aufruf, was sie tatsächlich braucht.
defineProps<{
  index: KoerperdatenIndex
  kennzahlen: Kennzahlen
  serien: KoerperdatenSerien
  /**
   * Wohin die Kacheln führen, wenn die ausführlichen Verläufe **nicht** auf
   * derselben Seite stehen (Startseite → `/dashboard`). Ohne Angabe scrollt der
   * Klick im Dokument zum Verlauf desselben Markers.
   */
  zielSeite?: string
}>()
</script>

<template>
  <!-- Auf dem Handy zwei Spalten, damit die Zahlen groß genug bleiben; darüber vier,
       sodass Index (doppelt breit) und die sechs Marker genau zwei volle Reihen
       füllen. -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
    <!-- Der Körperdaten-Index eröffnet die Zeile als doppelt breite Kachel: eine
         Zahl zum Einstieg, die auf Klick zeigt, woraus sie sich rechnet. Bewusst
         keine Tagesform-Einschätzung, siehe ADR-0006. -->
    <KoerperdatenIndexKachel
      class="col-span-2"
      :index="index"
      :anker="VERLAUF_ANKER.index"
      :ziel-seite="zielSeite"
    />

    <KoerperdatenKachel
      titel="HRV"
      einheit="ms"
      :kennzahl="kennzahlen.hrv"
      :serie="serien.hrv.nachtwert"
      :anker="VERLAUF_ANKER.hrv"
      :ziel-seite="zielSeite"
    >
      <BaselineBand
        :wert="kennzahlen.hrv.wert"
        :unten="kennzahlen.hrv.band_unten"
        :oben="kennzahlen.hrv.band_oben"
      />
    </KoerperdatenKachel>

    <KoerperdatenKachel
      titel="Schlaf"
      einheit="h"
      :stellen="1"
      strich="stroke-info"
      :kennzahl="kennzahlen.schlaf_stunden"
      :serie="serien.schlaf.gesamt_stunden"
      :anker="VERLAUF_ANKER.schlaf"
      :ziel-seite="zielSeite"
    />

    <KoerperdatenKachel
      titel="Ruhepuls"
      einheit="bpm"
      strich="stroke-error"
      :kennzahl="kennzahlen.ruhepuls"
      :serie="serien.ruhepuls"
      :anker="VERLAUF_ANKER.ruhepuls"
      :ziel-seite="zielSeite"
    />

    <KoerperdatenKachel
      titel="Body-Battery-Bilanz"
      strich="stroke-success"
      :kennzahl="kennzahlen.body_battery_bilanz"
      :serie="serien.body_battery.bilanz"
      :anker="VERLAUF_ANKER.bodyBattery"
      :ziel-seite="zielSeite"
    />

    <KoerperdatenKachel
      titel="Bereitschaft (morgens)"
      :kennzahl="kennzahlen.bereitschaft_morgenwert"
      :serie="serien.bereitschaft.morgenwert"
      :anker="VERLAUF_ANKER.bereitschaft"
      :ziel-seite="zielSeite"
    />

    <KoerperdatenKachel
      titel="Akute Last"
      strich="stroke-secondary"
      :kennzahl="kennzahlen.akute_last"
      :serie="serien.bereitschaft.akute_last"
      :anker="VERLAUF_ANKER.bereitschaft"
      :ziel-seite="zielSeite"
    />
  </div>
</template>
