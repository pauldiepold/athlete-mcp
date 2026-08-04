<script setup lang="ts">
import type { Koerperdaten } from '@shared/garmin/formatKoerperdaten'

// Die Rohwert-Tabelle der Tages-Detailansicht (Issue #27): alles, was für diesen Tag
// archiviert ist, Feld für Feld. Sie ist der Beleg unter dem Bild — was die Achse
// oben zeigt, steht hier noch einmal als Zahl, samt der Felder, die auf einer
// Zeitachse keinen Platz haben (Feedback, Erholungszeit, akute Last).
//
// Bewusst **generisch** über den Blob gelaufen statt als handgeschriebene Liste von
// Zeilen: eine feste Liste würde ein später hinzukommendes Feld still verschlucken,
// und der Zweck dieser Tabelle ist gerade, dass nichts verborgen bleibt. Aus
// demselben Grund stehen die Feldnamen roh da, unübersetzt — dieselbe Leitlinie wie
// beim Auslöser (ADR-0002).
const props = defineProps<{ tag: Koerperdaten }>()

type Wert = string | number | boolean | null | undefined

/** Ein Block des Blobs mit skalaren Feldern; `zeilen: null` heißt „nicht archiviert". */
interface Block {
  name: string
  zeilen: { feld: string, wert: Wert }[] | null
}

/** Eine Liste im Blob (Readings, Ereignisse) als eigene Tabelle. */
interface Liste {
  name: string
  spalten: string[]
  zeilen: Record<string, Wert>[]
}

/** Die Spalten einer Liste: die Vereinigung aller vorkommenden Felder. */
function alsListe(name: string, eintraege: unknown[]): Liste {
  const zeilen = eintraege.map(e => (e ?? {}) as Record<string, Wert>)
  const spalten: string[] = []
  for (const zeile of zeilen) {
    for (const feld of Object.keys(zeile)) {
      if (!spalten.includes(feld)) spalten.push(feld)
    }
  }
  return { name, spalten, zeilen }
}

const aufteilung = computed(() => {
  const bloecke: Block[] = []
  const listen: Liste[] = []

  for (const [name, inhalt] of Object.entries(props.tag as unknown as Record<string, unknown>)) {
    if (name === 'date') continue

    if (inhalt === null || inhalt === undefined) {
      bloecke.push({ name, zeilen: null })
      continue
    }

    if (Array.isArray(inhalt)) {
      listen.push(alsListe(name, inhalt))
      continue
    }

    if (typeof inhalt !== 'object') {
      bloecke.push({ name, zeilen: [{ feld: name, wert: inhalt as Wert }] })
      continue
    }

    const zeilen: { feld: string, wert: Wert }[] = []
    for (const [feld, wert] of Object.entries(inhalt as Record<string, unknown>)) {
      // Eine Liste innerhalb eines Blocks (body_battery.events) bekommt eine eigene
      // Tabelle statt einer Zelle voll JSON.
      if (Array.isArray(wert)) {
        listen.push(alsListe(`${name}.${feld}`, wert))
        continue
      }
      zeilen.push({ feld, wert: wert as Wert })
    }
    bloecke.push({ name, zeilen })
  }

  return { bloecke, listen }
})

/** Ein Rohwert als Text — `null` bleibt sichtbar leer, `false` bleibt `false`. */
function formatiere(wert: Wert): string {
  if (wert === null || wert === undefined) return '–'
  if (typeof wert === 'boolean') return wert ? 'ja' : 'nein'
  if (typeof wert === 'number') return new Intl.NumberFormat('de-DE').format(wert)
  return wert === '' ? '–' : wert
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <section v-for="block in aufteilung.bloecke" :key="block.name">
        <h3 class="mb-1 font-mono text-xs text-dimmed">{{ block.name }}</h3>

        <p v-if="block.zeilen === null" class="text-sm text-muted">
          Für diesen Tag nicht archiviert.
        </p>

        <table v-else class="w-full text-left text-xs">
          <tbody>
            <tr v-for="zeile in block.zeilen" :key="zeile.feld" class="border-t border-default">
              <td class="py-1 pr-2 font-mono text-dimmed">{{ zeile.feld }}</td>
              <td class="py-1 text-right tabular-nums">{{ formatiere(zeile.wert) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <!-- Die Listen (Readings, Ereignisse) in voller Breite: hier steht jedes Feld
         jedes Eintrags, auch die, die auf der Achse oben keinen Platz haben.
         Schmale Geräte scrollen die Tabelle für sich, statt die Seite zu sprengen. -->
    <section v-for="liste in aufteilung.listen" :key="liste.name">
      <h3 class="mb-1 font-mono text-xs text-dimmed">{{ liste.name }}</h3>

      <p v-if="!liste.zeilen.length" class="text-sm text-muted">
        Für diesen Tag nicht archiviert.
      </p>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-max text-left text-xs">
          <thead class="text-dimmed">
            <tr>
              <th
                v-for="spalte in liste.spalten"
                :key="spalte"
                class="py-1 pr-3 font-mono font-normal"
              >{{ spalte }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(zeile, i) in liste.zeilen" :key="i" class="border-t border-default">
              <td
                v-for="spalte in liste.spalten"
                :key="spalte"
                class="py-1 pr-3 tabular-nums"
              >{{ formatiere(zeile[spalte]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
