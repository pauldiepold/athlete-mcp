<script setup lang="ts">
import { isValidKw } from '@shared/steuerung/steuerungStore'
import { alsZeitraumName } from '#shared/zeitraum'

// Die Verläufe — der Inhalt des Dashboards (Issue #24, ausgebaut in #25): oben die
// Kachelzeile mit dem aktuellen Stand, darunter die Charts und die Wochenliste.
//
// Seit Issue #51 eine eigene Komponente unterhalb von `AthletDashboard`, und der
// Schnitt ist der Zweck: Sie wird **nur montiert, wenn Körperdaten vorhanden sind**.
// Dadurch startet der Abruf unten gar nicht erst für ein Konto, das noch nichts hat —
// und leere Charts, die aussehen wie kaputte, kann es hier nicht geben.
//
// Die Fläche bleibt dumm: der Endpunkt liefert fertige Serien und Kennzahlen,
// gerechnet im getesteten Modul koerperdatenSerien. Hier steht nur, was nebeneinander
// gehört und wie es heißt.
const route = useRoute()

// Der Zeitraum steht in der URL — ein Wert, dem alle Charts und Kacheln gemeinsam
// folgen. useFetch beobachtet ihn und lädt beim Umschalten neu.
const zeitraum = computed(() => alsZeitraumName(route.query.zeitraum))

// Eine einzelne Kalenderwoche als Ausschnitt (`?kw=YYYY-Www`) — die vierte Wahl neben
// den drei benannten Zeiträumen. Sie kommt aus der Wochenliste unten und aus dem
// Körperdaten-Streifen der Steuerungs-Wochenseite (Issue #28) und ersetzt `zeitraum`
// vollständig, statt daneben zu bestehen: keiner der Umschalter-Knöpfe ist dann
// „aktiv", bis der Athlet selbst wieder einen wählt.
const kw = computed(() => {
  const wert = route.query.kw
  return typeof wert === 'string' && isValidKw(wert) ? wert : null
})

const serienQuery = computed(() =>
  kw.value ? { kw: kw.value } : { zeitraum: zeitraum.value },
)

// Feste Keys statt der aus der URL abgeleiteten: Endet die Erstbefüllung, während diese
// Komponente schon steht, holt `useStartseitenZustand` beide Abrufe darüber nach — sonst
// blieben die Charts auf den drei Tagen stehen, die beim Montieren da waren.
const { data } = await useFetch('/api/koerperdaten/serien', {
  key: 'koerperdaten-serien',
  query: serienQuery,
})

// Die Wochenliste (Issue #28, Richtung 1 der Steuerungs-Brücke): ein eigener
// Endpunkt über die volle Historie, unabhängig vom Zeitraum-Umschalter der Charts
// darüber — sie ist ein Rückblick über Wochen, kein weiterer gezoomter Verlauf.
const { data: wochenData } = await useFetch('/api/koerperdaten/wochen', {
  key: 'koerperdaten-wochen',
})

// Dieselben Wochen speisen die Liste unten und die Wochen-Auswahl oben im Umschalter:
// eine Quelle, damit dort nichts wählbar ist, was es hier nicht gibt.
const wochenKws = computed(() => (wochenData.value?.wochen ?? []).map(w => w.kw))

/** „2026-07-01" → „01.07." — für die Zeitraum-Angabe über den Charts. */
function kurz(datum: string): string {
  const [, monat, tag] = datum.split('-')
  return `${tag}.${monat}.`
}

// Der Weg vom Verlauf in den einzelnen Tag (Issue #27): ein Klick auf einen Tag in
// irgendeinem Verlauf öffnet dessen Detailansicht. Jeder Chart ist ein Eingang —
// wer eine auffällige Nacht sieht, soll nicht erst suchen müssen, wo man klickt.
function oeffneTag(tag: string) {
  return navigateTo(`/tag/${tag}`)
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-xl font-semibold">Körperdaten</h1>
        <!-- Der Untertitel sagt, was diese Fläche ist — nicht, wie man sie bedient.
             Bedienhinweise stehen dort, wo sie gelten (siehe über den Verläufen). -->
        <p class="text-sm text-muted">
          Dein Archiv als Verlauf: der Stand von heute und die Wochen dahinter.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <p v-if="data" class="mr-1 text-sm text-muted tabular-nums">
          {{ kurz(data.von) }} – {{ kurz(data.bis) }}
        </p>
        <ZeitraumUmschalter :zeitraum="zeitraum" :kw="kw" :wochen="wochenKws" />
      </div>
    </div>

    <!-- Bei gewählter Woche der Weg in ihren Steuerungseintrag — bewusst in einer
         eigenen Zeile unter der Zeitraum-Wahl: das ist keine weitere Zeitraum-Wahl,
         sondern ein Wechsel der Fläche, und stünde er dazwischen, läse er sich wie
         ein vierter Ausschnitt. -->
    <div v-if="kw" class="mb-4 flex justify-end">
      <UButton
        :to="`/steuerung/${kw}`"
        color="neutral"
        variant="ghost"
        size="xs"
        trailing-icon="i-lucide-arrow-right"
      >{{ kw }} im Trainingsbuch öffnen</UButton>
    </div>

    <template v-if="data">
      <!-- Die Kachelzeile liegt seit Issue #60 als eigene Komponente daneben: Sie steht
           auch auf der Startseite, und zwei Abschriften desselben Grids liefen bei der
           nächsten Kachel auseinander. -->
      <KoerperdatenKacheln
        class="mb-6"
        :index="data.index"
        :kennzahlen="data.kennzahlen"
        :serien="data.serien"
      />

      <!-- Der Bedienhinweis zu den Verläufen: klein, mit Icon und direkt über dem,
           wofür er gilt — als Untertitel der Seite hätte er wie deren Beschreibung
           ausgesehen, obwohl er nur eine Geste erklärt. -->
      <p class="mb-2 flex items-center gap-1.5 text-xs text-dimmed">
        <UIcon name="i-lucide-mouse-pointer-click" class="size-3.5 shrink-0" />
        Ein Klick auf einen Tag im Verlauf öffnet seine Details.
      </p>

      <div class="space-y-4">
        <!-- Der Index zuerst: das grobe Bild vor seinen Bestandteilen. An Tagen,
             an denen zu viele Marker fehlten, bleibt die Linie offen — der Index
             wird dort nicht geschätzt. -->
        <ZeitreihenChart
          :id="VERLAUF_ANKER.index"
          class="scroll-mt-20"
          titel="Körperdaten-Index: die vier Marker zu einer Zahl gerechnet"
          :tage="data.serien.tage"
          :reihen="[
            { label: 'Körperdaten-Index', werte: data.index.serie, farbe: 'primaer' },
          ]"
          @tag-klick="oeffneTag"
        />

        <ZeitreihenChart
          :id="VERLAUF_ANKER.hrv"
          class="scroll-mt-20"
          titel="HRV gegen das eigene Baseline-Band"
          einheit="ms"
          :tage="data.serien.tage"
          :band="{
            label: 'Baseline-Band',
            unten: data.serien.hrv.band_unten,
            oben: data.serien.hrv.band_oben,
          }"
          :reihen="[
            { label: 'Nachtwert', werte: data.serien.hrv.nachtwert, farbe: 'primaer' },
            { label: 'Wochenschnitt', werte: data.serien.hrv.wochenschnitt, farbe: 'sekundaer' },
          ]"
          @tag-klick="oeffneTag"
        />

        <!-- Die akute Last liegt als ruhige Fläche hinter dem Morgenwert: sie ist
             der Zusammenhang, nicht die Aussage. Zweite Achse, weil ein Score
             (0–100) und die Last nicht dieselbe Skala haben. -->
        <ZeitreihenChart
          :id="VERLAUF_ANKER.bereitschaft"
          class="scroll-mt-20"
          titel="Bereitschaft am Morgen gegen die akute Last"
          :tage="data.serien.tage"
          :reihen="[
            {
              label: 'Akute Last',
              werte: data.serien.bereitschaft.akute_last,
              art: 'flaeche',
              achse: 'rechts',
              farbe: 'tertiaer',
            },
            {
              label: 'Bereitschaft (morgens)',
              werte: data.serien.bereitschaft.morgenwert,
              farbe: 'primaer',
            },
          ]"
          @tag-klick="oeffneTag"
        />

        <ZeitreihenChart
          :id="VERLAUF_ANKER.schlaf"
          class="scroll-mt-20"
          titel="Schlafphasen, Schlafscore und Sieben-Tage-Mittel"
          einheit="h"
          :tage="data.serien.tage"
          :reihen="[
            { label: 'Tief', werte: data.serien.schlaf.tief_stunden, art: 'balken', stapel: 'schlaf', farbe: 'primaer' },
            { label: 'Leicht', werte: data.serien.schlaf.leicht_stunden, art: 'balken', stapel: 'schlaf', farbe: 'sekundaer' },
            { label: 'REM', werte: data.serien.schlaf.rem_stunden, art: 'balken', stapel: 'schlaf', farbe: 'tertiaer' },
            { label: 'Wach', werte: data.serien.schlaf.wach_stunden, art: 'balken', stapel: 'schlaf', farbe: 'warnung' },
            { label: 'Ø 7 Tage (gesamt)', werte: data.serien.schlaf.gesamt_mittel_7, gestrichelt: true, farbe: 'gedaempft' },
            { label: 'Schlafscore', werte: data.serien.schlaf.score, achse: 'rechts', farbe: 'erfolg' },
          ]"
          @tag-klick="oeffneTag"
        />

        <!-- Ruhepuls und Hauttemperatur gehören zusammen (das klassische
             Frühwarnmuster). Die Hauttemperatur ist in vielen Zeilen gar nicht
             gemessen — sie bleibt dann leer, ohne den Ruhepuls mitzunehmen.
             Die Ruhepuls-Achse beginnt nicht bei null: die paar Schläge
             Abweichung sind die Aussage, und von 0 bpm an wären sie nicht mehr
             zu sehen. -->
        <ZeitreihenChart
          :id="VERLAUF_ANKER.ruhepuls"
          class="scroll-mt-20"
          titel="Ruhepuls und Hauttemperatur-Abweichung"
          einheit="bpm"
          einheit-rechts="°C"
          enge-achse
          :tage="data.serien.tage"
          :reihen="[
            { label: 'Ruhepuls', werte: data.serien.ruhepuls, farbe: 'primaer' },
            {
              label: 'Hauttemperatur-Abweichung',
              werte: data.serien.hauttemperatur_abweichung,
              achse: 'rechts',
              farbe: 'warnung',
            },
          ]"
          @tag-klick="oeffneTag"
        />

        <ZeitreihenChart
          :id="VERLAUF_ANKER.bodyBattery"
          class="scroll-mt-20"
          titel="Body-Battery-Bilanz: Ladetage und Zehrtage"
          :tage="data.serien.tage"
          :reihen="[
            {
              label: 'Geladen minus verbraucht',
              werte: data.serien.body_battery.bilanz,
              art: 'balken',
              vorzeichenfarben: true,
            },
          ]"
          @tag-klick="oeffneTag"
        />

        <ZeitreihenChart
          titel="Stress im Tagesdurchschnitt"
          :tage="data.serien.tage"
          :reihen="[
            { label: 'Stress', werte: data.serien.stress, farbe: 'warnung' },
          ]"
          @tag-klick="oeffneTag"
        />
      </div>

      <!-- Die Steuerungs-Brücke, Richtung 1 (Issue #28): pro Woche das
           Körperdaten-Aggregat neben dem Auszug des Steuerungs-Wocheneintrags —
           "das hatte ich geplant" neben "so hat mein Körper die Woche erlebt". -->
      <WochenListe
        class="mt-4"
        :wochen="wochenData?.wochen ?? []"
        :aktive-kw="kw"
      />
    </template>
  </div>
</template>
