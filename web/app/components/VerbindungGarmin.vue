<script setup lang="ts">
// Das Formular der Garmin-Verbindung (Issue #44, belegt durch Spike #38).
//
// Zwei Schritte, weil Garmins Login an der Zwei-Faktor-Abfrage zerfällt. Ob ein Konto
// sie verlangt, weiß man erst nach dem ersten Schritt — deshalb ist der zweite kein
// eigener Assistent, sondern erscheint an derselben Stelle, wenn er nötig wird.
//
// **Die Zugangsdaten werden nie gespeichert** (Auflage aus Spike #38): Sie gehen
// einmal an den Server und werden hier sofort danach vergessen. Was bleibt, ist
// Garmins eigenes Token-Bündel.
//
// Der Pfad ist inoffiziell und wird brechen. Jeder Fehlschlag endet deshalb in einer
// lesbaren Meldung mit einem Weg zurück ins Formular — nicht in einer Fehlerseite.
const emit = defineEmits<{ fertig: [] }>()

const email = ref('')
const passwort = ref('')
const code = ref('')

/** Solange ein Handle steht, wartet Garmin auf den Bestätigungscode. */
const mfaHandle = ref<string | null>(null)

const sendet = ref(false)
const fehler = ref<string | null>(null)

/**
 * Durch — ab hier gehört die Fläche dem, der das Formular eingebettet hat.
 *
 * Ohne diesen Zustand fiele das Formular nach dem eingelösten Code auf seinen ersten
 * Schritt zurück (`mfaHandle` ist wieder leer), und der Athlet sähe für den Moment, in
 * dem der Zustand nachgeladen wird, wieder das leere Anmeldeformular — als hätte sein
 * gerade bestätigter Code nichts bewirkt.
 */
const abgeschlossen = ref(false)

function vergissZugangsdaten() {
  passwort.value = ''
}

async function senden(aufruf: () => Promise<unknown>) {
  sendet.value = true
  fehler.value = null
  try {
    await aufruf()
  } catch (e) {
    fehler.value =
      (e as { statusMessage?: string }).statusMessage
      ?? 'Die Verbindung zu Garmin hat nicht geklappt. Bitte versuch es noch einmal.'
  } finally {
    sendet.value = false
  }
}

function starten() {
  return senden(async () => {
    const antwort = await $fetch('/api/verbindungen/garmin', {
      method: 'POST',
      body: { email: email.value, password: passwort.value },
    })

    // Ab hier braucht niemand mehr das Passwort — auch nicht für den zweiten Schritt:
    // Der läuft über den Handle, nicht über die Zugangsdaten.
    vergissZugangsdaten()

    if (antwort.art === 'mfa') {
      mfaHandle.value = antwort.handle
      return
    }
    abgeschlossen.value = true
    emit('fertig')
  })
}

function codeEinloesen() {
  return senden(async () => {
    await $fetch('/api/verbindungen/garmin/mfa', {
      method: 'POST',
      body: { handle: mfaHandle.value, code: code.value },
    })
    code.value = ''
    abgeschlossen.value = true
    emit('fertig')
  })
}

// Der Weg zurück, wenn der Code nicht ankommt oder der Versuch abgelaufen ist. Ohne
// ihn säße der Athlet in einem Zustand fest, aus dem nur ein Seiten-Neuladen hilft.
function nochmalVonVorn() {
  mfaHandle.value = null
  code.value = ''
  fehler.value = null
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="abgeschlossen" class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 shrink-0 animate-spin" />
      <p>Geschafft — wir schließen die Verbindung gerade ab.</p>
    </div>

    <template v-else-if="mfaHandle">
      <form class="flex flex-col gap-4" @submit.prevent="codeEinloesen">
        <p class="text-sm text-muted">
          Garmin hat dir einen Bestätigungscode geschickt. Gib ihn hier ein — er gilt
          nur wenige Minuten.
        </p>

        <UFormField label="Bestätigungscode" required>
          <UInput
            v-model="code"
            autofocus
            inputmode="numeric"
            autocomplete="one-time-code"
            spellcheck="false"
            class="w-full"
          />
        </UFormField>

        <UAlert
          v-if="fehler"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="fehler"
        />

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" size="sm" @click="nochmalVonVorn">
            Von vorn
          </UButton>
          <UButton type="submit" :loading="sendet" :disabled="!code.trim()">
            Bestätigen
          </UButton>
        </div>
      </form>
    </template>

    <template v-else>
      <form class="flex flex-col gap-4" @submit.prevent="starten">
        <p class="text-sm text-muted">
          Deine Zugangsdaten von Garmin Connect. Sie werden einmal an Garmin
          weitergereicht und nicht gespeichert.
        </p>

        <UFormField label="E-Mail-Adresse" required>
          <UInput
            v-model="email"
            type="email"
            autocomplete="username"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Passwort" required>
          <UInput
            v-model="passwort"
            type="password"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>

        <UAlert
          v-if="fehler"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="fehler"
        />

        <div class="flex justify-end">
          <UButton
            type="submit"
            :loading="sendet"
            :disabled="!email.trim() || !passwort"
          >Verbinden</UButton>
        </div>
      </form>
    </template>
  </div>
</template>
