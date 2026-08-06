<script setup lang="ts">
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'

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
  default: () => ({ verbunden: false, lauf: null as ErstbefuellungLauf | null }),
})

const startet = ref(false)
const fehler = ref<string | null>(null)

const lauf = computed(() => data.value?.lauf ?? null)
const laeuft = computed(() => lauf.value?.status === 'laeuft')

/**
 * Solange geholt wird, nachfragen. Der Lauf meldet sich nicht von selbst zurück — er
 * lebt in einem anderen Request.
 *
 * Zehn Sekunden und nicht zwei: Der Zustand liegt im KV, und das ist *eventually
 * consistent* — häufiger zu fragen liefert dieselbe Antwort noch einmal. Ein Lauf
 * dauert rund eine Minute; ein paar Sekunden Nachlauf in der Anzeige sind der Preis
 * dafür, dass hier kein Durable Object steht.
 */
let timer: ReturnType<typeof setInterval> | undefined
watch(laeuft, (aktiv) => {
  clearInterval(timer)
  if (aktiv) timer = setInterval(() => refresh(), 10_000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

const meldung = computed(() => {
  const l = lauf.value
  if (!l) return 'Deine Körperdaten der letzten 30 Tage sind noch nicht geholt worden.'
  if (l.status === 'laeuft')
    return 'Deine Körperdaten der letzten 30 Tage werden gerade geholt — das dauert etwa eine Minute.'
  if (l.status === 'gescheitert')
    return 'Der Abruf deiner Körperdaten ist gescheitert. Versuch es gleich noch einmal.'
  if (l.geschrieben === 0)
    return 'Deine Körperdaten der letzten 30 Tage liegen vollständig vor.'

  const geholt = `${l.geschrieben} ${l.geschrieben === 1 ? 'Tag' : 'Tage'} Körperdaten geholt.`
  // Ein teilweise gescheiterter Lauf sähe sonst aus wie ein geglückter: „20 Tage
  // geholt" ohne den Hinweis, dass zehn fehlen, und der Athlet hätte keinen Anlass,
  // den Knopf noch einmal zu drücken.
  return l.gescheitert > 0
    ? `${geholt} ${l.gescheitert} ${l.gescheitert === 1 ? 'Tag' : 'Tage'} hat Garmin nicht geliefert — ein zweiter Versuch holt sie nach.`
    : geholt
})

async function holen() {
  startet.value = true
  fehler.value = null
  try {
    data.value = { ...data.value, lauf: (await $fetch('/api/verbindungen/garmin/erstbefuellung', { method: 'POST' })).lauf }
  } catch (e) {
    fehler.value =
      (e as { statusMessage?: string }).statusMessage
      ?? 'Das Holen hat nicht geklappt. Bitte versuch es noch einmal.'
  } finally {
    startet.value = false
  }
}
</script>

<template>
  <div v-if="data?.verbunden" class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-sm text-muted">
      <UIcon v-if="laeuft" name="i-lucide-loader-circle" class="mr-1 animate-spin align-[-2px]" />
      {{ fehler ?? meldung }}
    </p>

    <UButton
      color="neutral"
      variant="subtle"
      size="sm"
      :loading="startet || laeuft"
      :disabled="laeuft"
      @click="holen"
    >
      {{ lauf && lauf.status !== 'laeuft' ? 'Neu holen' : 'Körperdaten holen' }}
    </UButton>
  </div>
</template>
