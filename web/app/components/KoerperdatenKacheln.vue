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
    <KoerperdatenIndexKachel class="col-span-2" :index="index" />

    <KoerperdatenKachel
      titel="HRV"
      einheit="ms"
      :kennzahl="kennzahlen.hrv"
      :serie="serien.hrv.nachtwert"
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
    />

    <KoerperdatenKachel
      titel="Ruhepuls"
      einheit="bpm"
      strich="stroke-error"
      :kennzahl="kennzahlen.ruhepuls"
      :serie="serien.ruhepuls"
    />

    <KoerperdatenKachel
      titel="Body-Battery-Bilanz"
      strich="stroke-success"
      :kennzahl="kennzahlen.body_battery_bilanz"
      :serie="serien.body_battery.bilanz"
    />

    <KoerperdatenKachel
      titel="Bereitschaft (morgens)"
      :kennzahl="kennzahlen.bereitschaft_morgenwert"
      :serie="serien.bereitschaft.morgenwert"
    />

    <KoerperdatenKachel
      titel="Akute Last"
      strich="stroke-secondary"
      :kennzahl="kennzahlen.akute_last"
      :serie="serien.bereitschaft.akute_last"
    />
  </div>
</template>
