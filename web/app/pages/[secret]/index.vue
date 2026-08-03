<script setup lang="ts">
import { alsZeitraumName } from '#shared/zeitraum'

// Dashboard — die Startseite des per-User-Links (Issue #24, ausgebaut in #25). Wer
// seinen Link öffnet, sieht als Erstes seine Körperdaten: oben die Kachelzeile mit
// dem aktuellen Stand, darunter die Verläufe. Die Steuerung liegt eine Ebene tiefer
// und ist über die Kopfzeile erreichbar. Auth unverändert: allein das View-Secret in
// der URL (ADR-0003/0004), server-seitig aufgelöst.
//
// Die Seite bleibt dumm: der Endpunkt liefert fertige Serien und Kennzahlen,
// gerechnet im getesteten Modul koerperdatenSerien. Hier steht nur, was nebeneinander
// gehört und wie es heißt.
const route = useRoute()
const secret = route.params.secret as string

// Der Zeitraum steht in der URL — ein Wert, dem alle Charts und Kacheln gemeinsam
// folgen. useFetch beobachtet ihn und lädt beim Umschalten neu.
const zeitraum = computed(() => alsZeitraumName(route.query.zeitraum))

const { data, error } = await useFetch(`/api/${secret}/koerperdaten/serien`, {
  query: { zeitraum },
})
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

useHead({
  title: data.value?.user ? `Körperdaten · ${data.value.user}` : 'Körperdaten',
})

/** „2026-07-01" → „01.07." — für die Zeitraum-Angabe über den Charts. */
function kurz(datum: string): string {
  const [, monat, tag] = datum.split('-')
  return `${tag}.${monat}.`
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <AthletHeader :user="data?.user ?? ''" :secret="secret" bereich="dashboard" />

    <UContainer class="w-full max-w-5xl flex-1 py-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 class="text-xl font-semibold">Körperdaten</h1>
        <div class="flex flex-wrap items-center gap-3">
          <p v-if="data" class="text-sm text-muted tabular-nums">
            {{ kurz(data.von) }} – {{ kurz(data.bis) }}
          </p>
          <ZeitraumUmschalter :model-value="zeitraum" />
        </div>
      </div>

      <template v-if="data">
        <!-- Der Körperdaten-Index steht als einzelne große Kachel über der
             Kachelzeile: eine Zahl zum Einstieg, die auf Klick zeigt, woraus sie
             sich rechnet. Bewusst keine Tagesform-Einschätzung, siehe ADR-0006. -->
        <KoerperdatenIndexKachel class="mb-3" :index="data.index" />

        <!-- Kachelzeile: der aktuelle Stand. Auf dem Handy zwei Spalten, damit die
             Zahlen groß genug bleiben. -->
        <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
          />

          <!-- Ruhepuls und Hauttemperatur gehören zusammen (das klassische
               Frühwarnmuster). Die Hauttemperatur ist in vielen Zeilen gar nicht
               gemessen — sie bleibt dann leer, ohne den Ruhepuls mitzunehmen. -->
          <ZeitreihenChart
            titel="Ruhepuls und Hauttemperatur-Abweichung"
            einheit="bpm"
            einheit-rechts="°C"
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
          />

          <ZeitreihenChart
            titel="Stress im Tagesdurchschnitt"
            :tage="data.serien.tage"
            :reihen="[
              { label: 'Stress', werte: data.serien.stress, farbe: 'warnung' },
            ]"
          />
        </div>
      </template>
    </UContainer>
  </div>
</template>
