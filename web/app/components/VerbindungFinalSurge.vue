<script setup lang="ts">
// Das Formular der Final-Surge-Verbindung (Issue #44).
//
// Der Server prüft die Zugangsdaten durch einen **echten** Login, bevor er sie
// speichert — was hier als Fehler erscheint, ist Final Surges eigene Antwort und nicht
// eine Vermutung dieser Seite. Ein Tippfehler fällt damit hier auf und nicht Tage
// später an leeren Plandaten.
const emit = defineEmits<{ fertig: [] }>()

const email = ref('')
const passwort = ref('')
const sendet = ref(false)
const fehler = ref<string | null>(null)

async function verbinden() {
  sendet.value = true
  fehler.value = null
  try {
    await $fetch('/api/verbindungen/finalsurge', {
      method: 'POST',
      body: { email: email.value, password: passwort.value },
    })
    // Das Passwort verlässt den Speicher dieser Seite, sobald es nicht mehr gebraucht
    // wird — es steht im KV und muss nicht auch noch im Browser herumliegen.
    passwort.value = ''
    emit('fertig')
  } catch (e) {
    fehler.value =
      (e as { statusMessage?: string }).statusMessage
      ?? 'Das Verbinden hat nicht geklappt. Bitte versuch es noch einmal.'
  } finally {
    sendet.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="verbinden">
    <p class="text-sm text-muted">
      Deine Zugangsdaten von Final Surge. Sie werden sofort geprüft — falsche Daten
      werden nicht gespeichert.
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
