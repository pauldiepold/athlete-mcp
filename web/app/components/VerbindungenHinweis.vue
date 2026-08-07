<script setup lang="ts">
// Der Hinweis oben auf dem Dashboard, solange eine Datenquelle nicht verbunden ist
// (Issue #44).
//
// Er steht hier und nicht als Tor davor: Ein neues Konto ist ab Sekunde eins nutzbar —
// die Steuerung braucht überhaupt keine externe Verbindung. Was fehlt, ist trotzdem
// erklärungsbedürftig, denn ein leeres Dashboard sieht aus wie ein kaputtes.
//
// Und er verschwindet, sobald alles steht. Die Einstellungen bleiben: Wer ein Passwort
// ändert, kommt über das Konto-Menü zurück, nicht über einen Hinweis, den es dann
// nicht mehr gibt.
import type { Datenquelle } from '@shared/verbindungen'

const { offen } = useVerbindungen()

/**
 * **Was tatsächlich fehlt, wenn diese Quelle fehlt** — je Datenquelle ein eigener Satz.
 *
 * Vorher stand hier ein gemeinsames „Solange die Verbindung fehlt, bleibt dieser
 * Bereich leer". Für Final Surge war das schlicht falsch: Leer bleibt dieser Bereich
 * nur ohne **Garmin**, denn hier stehen Körperdaten. Final Surge liefert den Plan des
 * Coaches, den Claude im Trainingsbuch liest — auf dieser Fläche wird dadurch nichts
 * leer. Ein Hinweis, der eine Folge behauptet, die der Athlet nebenan widerlegt sieht,
 * kostet die Glaubwürdigkeit aller anderen Hinweise mit.
 */
const FOLGE: Record<Datenquelle, Record<'fehlt' | 'kaputt', string>> = {
  garmin: {
    fehlt: 'Ohne Garmin bleiben deine Körperdaten leer.',
    kaputt: 'Von Garmin kommen gerade keine neuen Körperdaten an.',
  },
  finalsurge: {
    fehlt: 'Ohne Final Surge fehlt deinem Trainingsbuch der Plan deines Coaches — '
      + 'die Körperdaten hier sind davon nicht betroffen.',
    kaputt: 'Von Final Surge kommen gerade keine Planänderungen mehr an.',
  },
}

// Fehlend und unterbrochen sind für den Athleten verschiedene Aufgaben — „richte ein"
// gegen „richte neu ein". Beim gemischten Zustand (das eine fehlt, das andere ist
// kaputt) taugt keiner der beiden Sätze für beides: Er nennt dann jede Quelle mit
// ihrem eigenen Wort. Ein gemeinsamer Satz nach Mehrheitsentscheid hätte einer der
// beiden Quellen das Falsche unterstellt.
const einzeln = computed(() =>
  offen.value.map(v =>
    v.zustand === 'kaputt'
      ? `Die Verbindung zu ${v.name} ist unterbrochen`
      : `${v.name} ist noch nicht verbunden`,
  ),
)

const titel = computed(() => einzeln.value.join(' · '))

// Ein Satz je offener Quelle, in derselben Reihenfolge wie im Titel. Wohin es zum
// Beheben geht, sagt der Knopf darunter — als Satz stünde es bei zwei Quellen zweimal
// da und behauptete beim gemischten Zustand einen Weg für beide.
const text = computed(() =>
  offen.value
    .map(v => FOLGE[v.quelle][v.zustand === 'kaputt' ? 'kaputt' : 'fehlt'])
    .join(' '),
)

/**
 * Eine **unterbrochene** Verbindung ist eine Warnung: Etwas, das lief, läuft nicht
 * mehr. Eine nie hergestellte ist keine — beide Quellen sind überspringbar
 * (`shared/einrichtung.ts`), und wer Final Surge bewusst weglässt, bekäme sonst
 * dauerhaft ein gelbes Feld für eine Entscheidung, die er selbst getroffen hat.
 */
const farbe = computed(() =>
  offen.value.some(v => v.zustand === 'kaputt') ? 'warning' as const : 'neutral' as const,
)
</script>

<template>
  <UAlert
    v-if="offen.length"
    class="mb-6"
    :color="farbe"
    variant="subtle"
    icon="i-lucide-plug-zap"
    :title="titel"
    :description="text"
    :actions="[
      { label: 'Zu den Einstellungen', to: '/einstellungen', color: farbe, variant: 'solid' },
    ]"
  />
</template>
