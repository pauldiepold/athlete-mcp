<script setup lang="ts">
import { isValidKw } from '@shared/steuerung/steuerungStore'
import { alsZeitraumName } from '#shared/zeitraum'

// Das Dashboard — was ein angemeldeter Athlet auf `/` sieht (Issue #24, ausgebaut in
// #25): oben die Kachelzeile mit dem aktuellen Stand, darunter die Verläufe. Die
// Steuerung liegt eine Ebene tiefer und ist über die Kopfzeile erreichbar.
//
// Eine Komponente und keine eigene Seite, weil `/` zwei Gesichter hat: abgemeldet die
// Anmeldung, angemeldet dieses Dashboard (siehe pages/index.vue). Seit ADR-0007 steht
// kein Secret mehr im Pfad — wer der Athlet ist, sagt die Session, server-seitig.
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

const { data } = await useFetch('/api/koerperdaten/serien', {
  query: serienQuery,
})

// Die Wochenliste (Issue #28, Richtung 1 der Steuerungs-Brücke): ein eigener
// Endpunkt über die volle Historie, unabhängig vom Zeitraum-Umschalter der Charts
// darüber — sie ist ein Rückblick über Wochen, kein weiterer gezoomter Verlauf.
const { data: wochenData } = await useFetch('/api/koerperdaten/wochen')

// Dieselben Wochen speisen die Liste unten und die Wochen-Auswahl oben im Umschalter:
// eine Quelle, damit dort nichts wählbar ist, was es hier nicht gibt.
const wochenKws = computed(() => (wochenData.value?.wochen ?? []).map(w => w.kw))

useHead({ title: 'Körperdaten' })

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
  <div class="flex flex-1 flex-col">
    <AthletHeader bereich="dashboard" />

    <UContainer class="w-full max-w-5xl flex-1 py-6">
      <!-- Ganz oben, solange eine Datenquelle fehlt (Issue #44): Ein leeres Dashboard
           sieht aus wie ein kaputtes, und der Weg zur Abhilfe soll nicht gesucht
           werden müssen. Verschwindet von selbst, sobald alles steht. -->
      <VerbindungenHinweis />

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
        >{{ kw }} in der Steuerung öffnen</UButton>
      </div>

      <template v-if="data">
        <!-- Kachelzeile: der aktuelle Stand. Auf dem Handy zwei Spalten, damit die
             Zahlen groß genug bleiben; darüber vier, sodass Index (doppelt breit) und
             die sechs Marker genau zwei volle Reihen füllen. -->
        <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <!-- Der Körperdaten-Index eröffnet die Zeile als doppelt breite Kachel: eine
               Zahl zum Einstieg, die auf Klick zeigt, woraus sie sich rechnet. Bewusst
               keine Tagesform-Einschätzung, siehe ADR-0006. -->
          <KoerperdatenIndexKachel class="col-span-2" :index="data.index" />

          <KoerperdatenKachel
            titel="HRV"
            einheit="ms"
            :kennzahl="data.kennzahlen.hrv"
            :serie="data.serien.hrv.nachtwert"
          >
            <BaselineBand
              :wert="data.kennzahlen.hrv.wert"
              :unten="data.kennzahlen.hrv.band_unten"
              :oben="data.kennzahlen.hrv.band_oben"
            />
          </KoerperdatenKachel>

          <KoerperdatenKachel
            titel="Schlaf"
            einheit="h"
            :stellen="1"
            strich="stroke-info"
            :kennzahl="data.kennzahlen.schlaf_stunden"
            :serie="data.serien.schlaf.gesamt_stunden"
          />

          <KoerperdatenKachel
            titel="Ruhepuls"
            einheit="bpm"
            strich="stroke-error"
            :kennzahl="data.kennzahlen.ruhepuls"
            :serie="data.serien.ruhepuls"
          />

          <KoerperdatenKachel
            titel="Body-Battery-Bilanz"
            strich="stroke-success"
            :kennzahl="data.kennzahlen.body_battery_bilanz"
            :serie="data.serien.body_battery.bilanz"
          />

          <KoerperdatenKachel
            titel="Bereitschaft (morgens)"
            :kennzahl="data.kennzahlen.bereitschaft_morgenwert"
            :serie="data.serien.bereitschaft.morgenwert"
          />

          <KoerperdatenKachel
            titel="Akute Last"
            strich="stroke-secondary"
            :kennzahl="data.kennzahlen.akute_last"
            :serie="data.serien.bereitschaft.akute_last"
          />
        </div>

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
            titel="Körperdaten-Index: die vier Marker zu einer Zahl gerechnet"
            :tage="data.serien.tage"
            :reihen="[
              { label: 'Körperdaten-Index', werte: data.index.serie, farbe: 'primaer' },
            ]"
            @tag-klick="oeffneTag"
          />

          <ZeitreihenChart
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
    </UContainer>
  </div>
</template>
