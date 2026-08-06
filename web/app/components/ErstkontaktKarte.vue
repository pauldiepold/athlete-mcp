<script setup lang="ts">
import { ERSTKONTAKT_SATZ } from '@shared/steuerung/erstkontakt'

// Der Übergabepunkt vom Browser in den Chat (Issue #50): der eine Satz, mit dem das
// Onboarding-Verfahren anspringt, zum Kopieren.
//
// Warum er hier steht und nicht auf dem Dashboard: Er gehört zur **Einrichtung** — es
// ist ihr vierter Schritt, der als einziger die Weboberfläche verlässt. Und warum er
// überhaupt vorgegeben ist statt „frag Claude einfach irgendwas": Das Onboarding-Tool
// zielt absichtlich eng auf genau diesen Satz (Begründung am `ERSTKONTAKT_SATZ`), und
// der Preis dafür ist, dass der Athlet den Auslöser irgendwo lesen können muss.
//
// Er verschwindet, sobald ein Steuerungsplan existiert. Dessen Vorhandensein *ist* das
// Fertig-Signal des Onboardings — dieselbe Linie wie bei den Verbindungen: abgeleitet,
// nicht gemeldet, kein Flag daneben.
const { data } = useFetch('/api/steuerung/plan', {
  key: 'steuerungsplan',
  default: () => ({ markdown: '' }),
})

const offen = computed(() => !data.value?.markdown?.trim())

const kopiert = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function kopieren() {
  // `navigator.clipboard` fehlt in unsicheren Kontexten und älteren Browsern. Dann
  // bleibt der Satz trotzdem lesbar und markierbar — er steht im Klartext daneben,
  // genau deshalb ist er kein Tooltip.
  try {
    await navigator.clipboard.writeText(ERSTKONTAKT_SATZ)
    kopiert.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (kopiert.value = false), 2000)
  } catch {
    kopiert.value = false
  }
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <UCard v-if="offen">
    <template #header>
      <h2 class="font-semibold">Loslegen in Claude</h2>
    </template>

    <p class="text-sm text-muted">
      Schick diesen Satz in Claude, sobald der Connector eingerichtet ist. Claude fragt
      dich dann nach deinem Zielrennen und deiner Form und legt daraus deine Steuerung
      an — hier im Browser kannst du sie danach lesen und ändern.
    </p>

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <code class="rounded-md bg-elevated px-3 py-2 text-sm">{{ ERSTKONTAKT_SATZ }}</code>

      <UButton
        color="neutral"
        variant="subtle"
        size="sm"
        :icon="kopiert ? 'i-lucide-check' : 'i-lucide-copy'"
        @click="kopieren"
      >
        {{ kopiert ? 'Kopiert' : 'Kopieren' }}
      </UButton>
    </div>

    <p class="mt-3 text-sm text-muted">
      Nach Zugangsdaten fragt Claude dabei nie — Passwörter und Codes gehören nur auf
      diese Seite.
    </p>
  </UCard>
</template>
