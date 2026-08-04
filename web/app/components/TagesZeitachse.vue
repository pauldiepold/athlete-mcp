<script setup lang="ts">
import type { BodyBatteryEvent, TrainingReadinessReading } from '@shared/garmin/formatKoerperdaten'

// Die 24-Stunden-Achse der Tages-Detailansicht (Issue #27) — der Kern dieser Seite.
// Oben liegen die Training-Readiness-Readings als Punkte (Höhe = Score), darunter
// die Body-Battery-Ereignisse als Balken. Beide Spuren teilen sich **eine** Achse,
// deshalb stehen sie auch in einem Bauteil: nur so ist garantiert, dass der Punkt
// um 17:22 senkrecht über dem Balken liegt, der um 17:22 beginnt.
//
// Bewusst **kein** Chart.js und nicht durch den ZeitreihenChart-Wrapper: dessen
// Vertrag ist die dichte Kalender-Achse (ein Wert je Tag). Hier ist die Achse
// dagegen ein Tag in Stunden, die Readings tragen Text-Labels und die Ereignisse
// sind Strecken, keine Werte. Als absolut positioniertes Markup steht das Bild
// schon serverseitig da (wie MiniKurve, Issue #25), braucht kein Client-JS und
// bricht auf schmalen Geräten nicht.
//
// Zwei Fälle prägen die Darstellung:
//   - **Der Auslöser wird roh gezeigt.** Keine Übersetzungstabelle: die Werte sind
//     ein offener Code, und ältere Readings tragen gar keinen (ADR-0002). Fehlt er,
//     steht das da, statt dass ein Label verschwindet.
//   - **Ein Schlaf-Ereignis beginnt am Vorabend.** Sein Balken wird am linken Rand
//     abgeschnitten und als „kommt vom Vortag" markiert, statt die Achse über 24
//     Stunden hinaus zu dehnen; die echte Startzeit steht in der Zeile daneben.
const props = defineProps<{
  /** Der Tag dieser Achse, `YYYY-MM-DD` — 0 Uhr ist sein Beginn. */
  datum: string
  readings: TrainingReadinessReading[]
  events: BodyBatteryEvent[]
}>()

/** Die Stunden, an denen ein Gitterstrich steht. */
const GITTER = [0, 3, 6, 9, 12, 15, 18, 21, 24]

/**
 * Ein lokaler Zeitstempel (`YYYY-MM-DDTHH:MM`) als Stunden seit 0 Uhr dieses Tages.
 * Negativ, wenn er im Vortag liegt. `null`, wenn er fehlt oder unlesbar ist — dann
 * lässt sich der Eintrag nicht auf die Achse legen und wird stattdessen benannt.
 */
function stundeAmTag(zeitpunkt: string | null): number | null {
  if (!zeitpunkt) return null
  const ms = Date.parse(`${zeitpunkt}:00Z`) - Date.parse(`${props.datum}T00:00:00Z`)
  return Number.isNaN(ms) ? null : ms / 3_600_000
}

/** Stunde → Position auf der Achse in Prozent, auf [0, 100] beschnitten. */
function anteil(stunde: number): number {
  return Math.min(100, Math.max(0, (stunde / 24) * 100))
}

/** „2026-06-13T06:37" → „06:37". */
function uhrzeit(zeitpunkt: string): string {
  return zeitpunkt.slice(11, 16)
}

/** 451 → „7 h 31 min", 45 → „45 min". */
function dauer(minuten: number): string {
  const h = Math.floor(minuten / 60)
  const m = minuten % 60
  return h === 0 ? `${m} min` : `${h} h${m === 0 ? '' : ` ${m} min`}`
}

/**
 * Die Readings auf der Achse. Ein Reading ohne Uhrzeit hat keinen Ort auf einer
 * Zeitachse — es fällt hier heraus und wird unter der Achse aufgezählt, statt bei
 * 0 Uhr zu erscheinen und einen Morgenwert vorzutäuschen.
 */
const punkte = computed(() =>
  props.readings
    .map((reading, i) => ({ reading, stunde: stundeAmTag(reading.time), i }))
    .filter((p): p is { reading: TrainingReadinessReading, stunde: number, i: number } =>
      p.stunde !== null && p.stunde >= 0 && p.stunde <= 24,
    )
    .map(({ reading, stunde, i }) => ({
      key: `${reading.time}-${i}`,
      reading,
      links: anteil(stunde),
      // Die Höhe ist der Score. Ohne Score gibt es keine Höhe — der Punkt sitzt
      // dann auf der Grundlinie und bleibt hohl, statt als „0" gelesen zu werden.
      hoehe: reading.score ?? 0,
      ohneScore: reading.score === null,
      // Labels wechseln zwischen zwei Zeilen, damit zwei Readings kurz
      // hintereinander nicht übereinanderfallen.
      zeile: i % 2,
      // Am Rand rutscht ein mittig gesetztes Label aus dem Bild — dort wird es
      // an der Kante ausgerichtet.
      anker: anteil(stunde) < 12 ? 'links' : anteil(stunde) > 88 ? 'rechts' : 'mitte',
    })),
)

/** Wie viele Readings sich nicht auf die Achse legen ließen — benannt statt verschwiegen. */
const readingsOhneOrt = computed(() => props.readings.length - punkte.value.length)

/**
 * Die Ereignisse als Strecken auf derselben Achse. Ein Schlaf-Ereignis beginnt am
 * Vorabend: sein Balken beginnt dann am linken Rand (`vomVortag`), die Achse bleibt
 * bei 24 Stunden. Dasselbe am rechten Rand für ein Ereignis, das über Mitternacht
 * hinausläuft.
 */
const balken = computed(() =>
  props.events
    .map((event, i) => {
      const start = stundeAmTag(event.start)
      if (start === null) return null

      const ende = start + (event.duration_minutes ?? 0) / 60
      if (ende < 0 || start > 24) return null

      const von = anteil(start)
      const bis = anteil(ende)

      return {
        key: `${event.start}-${i}`,
        event,
        von,
        // Mindestbreite, damit ein sehr kurzes Ereignis nicht auf nichts zusammenfällt.
        breite: Math.max(bis - von, 0.6),
        vomVortag: start < 0,
        ueberMitternacht: ende > 24,
        startZeit: event.start ? uhrzeit(event.start) : null,
        endeZeit:
          event.start && event.duration_minutes !== null
            ? uhrzeit(
                new Date(
                  Date.parse(`${event.start}:00Z`) + event.duration_minutes * 60_000,
                ).toISOString().slice(0, 16),
              )
            : null,
        dauerText: event.duration_minutes === null ? null : dauer(event.duration_minutes),
      }
    })
    .filter(b => b !== null),
)

/** Ereignisse ohne brauchbare Startzeit — ebenfalls benannt, nicht unterschlagen. */
const eventsOhneOrt = computed(() => props.events.length - balken.value.length)
</script>

<template>
  <div class="space-y-4">
    <!-- Spur 1: die Readings. Die Höhe eines Punktes ist sein Score; die
         gestrichelte Führungslinie verbindet ihn mit seinem Label unter der Achse. -->
    <section>
      <h3 class="mb-1 text-sm font-medium">Training Readiness im Tagesverlauf</h3>

      <p v-if="!punkte.length && !readingsOhneOrt" class="py-6 text-center text-sm text-muted">
        Keine Readings für diesen Tag archiviert.
      </p>

      <template v-if="punkte.length">
        <div class="relative h-40 sm:h-48">
          <!-- Gitter: die Stunden, an denen auch die Achse beschriftet ist. -->
          <div
            v-for="stunde in GITTER"
            :key="`gitter-${stunde}`"
            class="absolute inset-y-0 w-px bg-default"
            :style="{ left: `${anteil(stunde)}%` }"
          />

          <div
            v-for="punkt in punkte"
            :key="punkt.key"
            class="absolute inset-y-0 w-px border-l border-dashed border-default"
            :style="{ left: `${punkt.links}%` }"
          />

          <!-- Der Punkt selbst, Höhe = Score (0 unten, 100 oben). -->
          <div
            v-for="punkt in punkte"
            :key="`punkt-${punkt.key}`"
            class="absolute -translate-x-1/2 translate-y-1/2"
            :style="{ left: `${punkt.links}%`, bottom: `${punkt.hoehe}%` }"
          >
            <span
              class="block size-3 rounded-full border-2 border-primary"
              :class="punkt.ohneScore ? 'bg-default' : 'bg-primary'"
            />
          </div>

          <!-- Der Score als Zahl über dem Punkt: die Aussage soll ablesbar sein,
               nicht geschätzt werden. -->
          <div
            v-for="punkt in punkte"
            :key="`score-${punkt.key}`"
            class="absolute -translate-x-1/2 -translate-y-1 text-xs font-semibold tabular-nums"
            :style="{ left: `${punkt.links}%`, bottom: `${punkt.hoehe}%` }"
          >
            {{ punkt.reading.score ?? '–' }}
          </div>
        </div>

        <!-- Die gemeinsame Achse beider Spuren. -->
        <div class="relative h-5 border-t border-default">
          <div
            v-for="stunde in GITTER"
            :key="`tick-${stunde}`"
            class="absolute top-0.5 text-[10px] text-dimmed tabular-nums"
            :class="stunde === 0 ? '' : stunde === 24 ? '-translate-x-full' : '-translate-x-1/2'"
            :style="{ left: `${anteil(stunde)}%` }"
          >
            {{ String(stunde).padStart(2, '0') }}
          </div>
        </div>

        <!-- Die Labels unter der Achse: Uhrzeit, Level und vor allem der Auslöser,
             roh. Zwei Zeilen im Wechsel, damit sie sich nicht überlagern. -->
        <div class="relative mt-1 h-16 sm:h-14">
          <div
            v-for="punkt in punkte"
            :key="`label-${punkt.key}`"
            class="absolute w-24 text-[10px] leading-tight sm:w-28"
            :class="[
              punkt.anker === 'mitte' ? '-translate-x-1/2 text-center' : '',
              punkt.anker === 'rechts' ? '-translate-x-full text-right' : '',
              punkt.zeile === 1 ? 'top-7' : 'top-0',
            ]"
            :style="{ left: `${punkt.links}%` }"
          >
            <span class="block font-medium tabular-nums">
              {{ punkt.reading.time ? uhrzeit(punkt.reading.time) : '–' }}
            </span>
            <span class="block text-dimmed">{{ punkt.reading.level ?? '–' }}</span>
            <!-- Roh, ohne Enum-Mapping. Fehlt der Auslöser (ältere Readings tragen
                 keinen), steht das ausdrücklich da. -->
            <span
              class="block break-words text-muted"
              :title="punkt.reading.trigger ?? 'ohne Auslöser'"
            >{{ punkt.reading.trigger ?? 'ohne Auslöser' }}</span>
          </div>
        </div>

      </template>

      <!-- Außerhalb des v-else, weil auch der Fall zählt, dass **alle** Readings
           ohne Uhrzeit ankommen: dann steht hier, dass es sie gibt, statt „keine
           Readings archiviert" zu behaupten. -->
      <p v-if="readingsOhneOrt > 0" class="mt-1 text-xs text-dimmed">
        {{ readingsOhneOrt }} Reading(s) ohne verwertbare Uhrzeit — nicht auf der
        Achse darstellbar, stehen aber in der Tabelle unten.
      </p>
    </section>

    <!-- Spur 2: die Ereignisse, auf derselben Achse. Eine Zeile je Ereignis, damit
         sich zwei überlappende Ereignisse nicht gegenseitig verdecken. -->
    <section>
      <h3 class="mb-1 text-sm font-medium">Body-Battery-Ereignisse</h3>

      <p v-if="!balken.length && !eventsOhneOrt" class="py-4 text-center text-sm text-muted">
        Keine Ereignisse für diesen Tag archiviert.
      </p>

      <div v-if="balken.length" class="space-y-2.5">
        <div v-for="b in balken" :key="b.key">
          <div class="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span class="font-medium">{{ b.event.type ?? 'ohne Typ' }}</span>
            <span class="text-dimmed tabular-nums">
              <template v-if="b.vomVortag">{{ b.startZeit }} (Vortag)</template>
              <template v-else>{{ b.startZeit ?? '–' }}</template>
              <template v-if="b.endeZeit"> – {{ b.endeZeit }}</template>
              <template v-if="b.dauerText"> · {{ b.dauerText }}</template>
            </span>
            <span
              v-if="b.event.impact !== null"
              class="font-medium tabular-nums"
              :class="b.event.impact >= 0 ? 'text-success' : 'text-error'"
            >{{ b.event.impact >= 0 ? '+' : '' }}{{ b.event.impact }}</span>
            <span v-if="b.event.feedback" class="text-muted">{{ b.event.feedback }}</span>
          </div>

          <div class="relative h-3">
            <div
              v-for="stunde in GITTER"
              :key="`gitter-${b.key}-${stunde}`"
              class="absolute inset-y-0 w-px bg-default"
              :style="{ left: `${anteil(stunde)}%` }"
            />
            <!-- Der Balken. Ein am Vorabend begonnenes Ereignis stößt links an den
                 Rand und wird dort eckig gelassen — die abgeschnittene Kante ist die
                 Aussage „das fing vor diesem Tag an". -->
            <div
              class="absolute inset-y-0.5 rounded-sm"
              :class="[
                (b.event.impact ?? 0) >= 0 ? 'bg-success/70' : 'bg-error/70',
                b.vomVortag ? 'rounded-l-none border-l-2 border-inverted/40' : '',
                b.ueberMitternacht ? 'rounded-r-none border-r-2 border-inverted/40' : '',
              ]"
              :style="{ left: `${b.von}%`, width: `${b.breite}%` }"
            />
          </div>
        </div>

        <!-- Die Achse noch einmal unter den Balken: dieselbe Skala, aber ohne sie
             wäre am unteren Rand der Spur nicht abzulesen, wann ein Balken endet. -->
        <div class="relative h-5 border-t border-default">
          <div
            v-for="stunde in GITTER"
            :key="`tick2-${stunde}`"
            class="absolute top-0.5 text-[10px] text-dimmed tabular-nums"
            :class="stunde === 0 ? '' : stunde === 24 ? '-translate-x-full' : '-translate-x-1/2'"
            :style="{ left: `${anteil(stunde)}%` }"
          >
            {{ String(stunde).padStart(2, '0') }}
          </div>
        </div>
      </div>

      <p v-if="eventsOhneOrt > 0" class="mt-1 text-xs text-dimmed">
        {{ eventsOhneOrt }} Ereignis(se) ohne verwertbare Startzeit — nicht auf der
        Achse darstellbar, stehen aber in der Tabelle unten.
      </p>
    </section>
  </div>
</template>
