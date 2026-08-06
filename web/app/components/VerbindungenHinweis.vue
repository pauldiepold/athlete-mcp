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
const { offen } = useVerbindungen()

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

const text = computed(() =>
  offen.value.some(v => v.zustand === 'kaputt')
    ? 'Von dort kommen gerade keine neuen Daten an. In den Einstellungen kannst du '
      + 'die Verbindung herstellen oder erneuern.'
    : 'Solange die Verbindung fehlt, bleibt dieser Bereich leer. Du kannst sie '
      + 'jederzeit in den Einstellungen herstellen.',
)
</script>

<template>
  <UAlert
    v-if="offen.length"
    class="mb-6"
    color="warning"
    variant="subtle"
    icon="i-lucide-plug-zap"
    :title="titel"
    :description="text"
    :actions="[
      { label: 'Zu den Einstellungen', to: '/einstellungen', color: 'warning', variant: 'solid' },
    ]"
  />
</template>
