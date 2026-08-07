<script setup lang="ts">
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'
import { erstbefuellungKnopfAnsicht } from '#shared/erstbefuellungKnopf'
import { ABFRAGE_INTERVALL_LAEUFT_MS } from '#shared/startseitenZustand'

// Die **Erstbefüllung** unter der Garmin-Karte (Issue #48): was der Hintergrundlauf
// gerade tut, und der Knopf, ihn noch einmal auszulösen.
//
// Warum es den Knopf gibt: Für einen Hintergrundlauf gibt es keine Zustellgarantie.
// Bricht er ab — Worker beendet, Garmin ratelimitet —, merkt es sonst niemand. Er ist
// deshalb der reguläre zweite Versuch und kein Reparatur-Sonderweg.
//
// Und warum der Zustand überhaupt sichtbar ist: Ohne ihn sähe ein Dashboard, dessen
// Daten gerade geholt werden, genauso aus wie eines, dessen Abruf gescheitert ist —
// und der Athlet drückte mitten in einen laufenden Abruf hinein. Wie die **Startseite**
// das zeigt, entscheidet ihr eigenes Ticket; hier steht die schlichte Fassung, die zum
// Ort gehört, an dem er gerade verbunden hat.
const { data, refresh } = useFetch('/api/verbindungen/garmin/erstbefuellung', {
  key: 'erstbefuellung',
  default: () => ({
    verbunden: false,
    lauf: null as ErstbefuellungLauf | null,
    offen: null as number | null,
  }),
})

// Dasselbe Anstoßen wie auf der Startseite (Issue #51) — ein Weg durch denselben POST,
// damit der Satz nach einem Fehlschlag an beiden Orten derselbe bleibt.
const { laeuftAn: startet, fehler, starten } = useErstbefuellungStart()

const lauf = computed(() => data.value?.lauf ?? null)
const laeuft = computed(() => lauf.value?.status === 'laeuft')

/**
 * Solange geholt wird, nachfragen. Der Lauf meldet sich nicht von selbst zurück — er
 * lebt in einem anderen Request.
 *
 * Der Takt steht bei den Startseiten-Zuständen (`ABFRAGE_INTERVALL_LAEUFT_MS`) und
 * gilt für beide Flächen: Es ist derselbe Lauf, der beobachtet wird, und zwei eigene
 * Intervalle wären zwei Aussagen darüber, wie schnell sich der KV-Zustand ändert.
 */
let timer: ReturnType<typeof setInterval> | undefined
watch(laeuft, (aktiv) => {
  clearInterval(timer)
  if (aktiv) timer = setInterval(() => refresh(), ABFRAGE_INTERVALL_LAEUFT_MS)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

// Was dasteht und was der Knopf anbietet, entscheidet die reine Fassung in
// `#shared/erstbefuellungKnopf` — die Fall-Reihenfolge ist das Eigentliche daran und
// in einer Template-Kette nicht prüfbar.
const ansicht = computed(() =>
  erstbefuellungKnopfAnsicht({ lauf: lauf.value, offen: data.value?.offen ?? null }),
)

async function holen() {
  const neuerLauf = await starten()
  if (fehler.value) return

  // Der Lauf aus der Antwort statt eines neuen Abrufs: Der KV-Zustand ist *eventually
  // consistent* und zeigte in derselben Sekunde womöglich noch den alten.
  if (neuerLauf) {
    data.value = { ...data.value, lauf: neuerLauf }
    return
  }

  // `null` heißt: Es wurde nichts angestoßen, weil nichts offen war. Ohne das Nachfragen
  // bliebe genau hier ein Knopf stehen, der nichts tut — die offenen Tage stammen aus
  // D1 und sind stark konsistent, die Antwort darauf stimmt sofort.
  await refresh()
}
</script>

<template>
  <div v-if="data?.verbunden" class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-sm text-muted">
      <UIcon v-if="laeuft" name="i-lucide-loader-circle" class="mr-1 animate-spin align-[-2px]" />
      {{ fehler ?? ansicht.meldung }}
    </p>

    <UButton
      color="neutral"
      variant="subtle"
      size="sm"
      :loading="startet || laeuft"
      :disabled="!ansicht.knopfAktiv"
      @click="holen"
    >
      {{ ansicht.knopfText }}
    </UButton>
  </div>
</template>
