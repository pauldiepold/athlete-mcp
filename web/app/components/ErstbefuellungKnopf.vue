<script setup lang="ts">
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
//
// Abruf, Takt und Anstoßen gehören dem Modul (`useErstbefuellung`) — diese Komponente
// wird an **zwei** Stellen montiert und dürfte davon nichts doppelt aufziehen. Hier
// steht nur, wie diese Fläche über den Fall redet: einzeilig und nebenbei.
const { lauf, offen, laeuft, fall, aktiv, laeuftAn, fehler, stand, anstossen }
  = useErstbefuellung()

/**
 * Die Zahl gehört zum Knopf und nur zu ihm: Sie sagt, wie viel ein Klick noch zu tun
 * hätte. `null` heißt „nicht feststellbar" — dann steht sie gar nicht da, statt einer
 * erfundenen Null.
 */
const fehlt = computed(() => {
  const n = offen.value
  return n === null ? '' : ` ${n} ${n === 1 ? 'Tag fehlt' : 'Tage fehlen'} noch.`
})

const meldung = computed(() => {
  switch (fall.value) {
    case 'laeuft':
      return 'Deine Körperdaten der letzten 30 Tage werden gerade geholt — das dauert etwa eine Minute.'
    case 'vollstaendig':
      return 'Deine Körperdaten der letzten 30 Tage liegen vollständig vor.'
    case 'nie-gelaufen':
      return `Deine Körperdaten der letzten 30 Tage sind noch nicht geholt worden.${fehlt.value}`
    case 'gescheitert':
      return 'Der Abruf deiner Körperdaten ist gescheitert. Versuch es gleich noch einmal.'
    case 'leer-geliefert':
      return `Für diese Tage hat Garmin nichts geliefert.${fehlt.value} Ein zweiter Versuch holt sie nach.`
    // Durchgelaufen, und trotzdem fehlt etwas. Ein teilweise gescheiterter Lauf sähe
    // sonst aus wie ein geglückter: „20 Tage geholt" ohne den Hinweis, dass zehn fehlen,
    // und der Athlet hätte keinen Anlass, den Knopf noch einmal zu drücken.
    // `default` und nicht `case 'unvollstaendig'`: Es ist der letzte Fall der Liste,
    // und ohne ihn als Abschluss hielte die Linter-Regel die Kette für unvollständig.
    default: {
      const n = lauf.value?.geschrieben ?? 0
      return `${n} ${n === 1 ? 'Tag' : 'Tage'} Körperdaten geholt.${fehlt.value} Ein zweiter Versuch holt sie nach.`
    }
  }
})

// „Körperdaten holen" nur, solange noch nie geholt wurde — während eines Laufs steht der
// Knopf ohnehin gesperrt und im Ladezustand da, aber sein Wort bleibt dasselbe wie das,
// was gerade passiert.
const knopfText = computed(() =>
  fall.value === 'laeuft' || fall.value === 'nie-gelaufen' ? 'Körperdaten holen' : 'Neu holen',
)
</script>

<template>
  <div v-if="stand?.garminVerbunden" class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-sm text-muted">
      <UIcon v-if="laeuft" name="i-lucide-loader-circle" class="mr-1 animate-spin align-[-2px]" />
      {{ fehler ?? meldung }}
    </p>

    <UButton
      color="neutral"
      variant="subtle"
      size="sm"
      :loading="laeuftAn || laeuft"
      :disabled="!aktiv"
      @click="anstossen"
    >
      {{ knopfText }}
    </UButton>
  </div>
</template>
