<script setup lang="ts">
// Die Invite-Fläche: der einzige Weg, auf dem ein Konto entsteht (ADR-0007).
//
// Wer hier landet, hat sich gerade erfolgreich bei Google oder Apple angemeldet — und
// ist trotzdem **nicht** eingeloggt: Seine Identität kennt noch kein Konto. Genau
// dieser Zwischenzustand liegt server-seitig im `pending`-Teil der Session; ohne ihn
// gibt es hier nichts zu tun.
//
// Der Anzeigename ist aus dem Provider **vorbelegt**, nicht übernommen. Der Grund
// steckt in Apple: Den Namen schickt es genau einmal, bei der allerersten
// Autorisierung — die liegt vor diesem Bildschirm. Wer hier abbricht und morgen
// wiederkommt, bekommt von Apple nie wieder einen. Als Vorbelegung eines änderbaren
// Feldes ist das folgenlos; als einzige Quelle wäre es ein Datenverlust ohne
// Reparaturweg.
const { data: offen, error: keinLogin } = await useFetch('/api/invite')

const code = ref('')
const anzeigename = ref(offen.value?.namensvorschlag ?? '')

const sendet = ref(false)
const fehler = ref<string | null>(null)

const verfahren = computed(() => (offen.value?.provider === 'apple' ? 'Apple' : 'Google'))

async function einloesen() {
  sendet.value = true
  fehler.value = null
  try {
    const { redirectTo } = await $fetch('/api/invite', {
      method: 'POST',
      body: { code: code.value, anzeigename: anzeigename.value },
    })
    // Die Session steht jetzt — voll neu laden statt clientseitig zu navigieren, damit
    // jede Fläche mit der frischen Session rendert.
    await navigateTo(redirectTo, { external: true })
  } catch (e) {
    fehler.value =
      (e as { statusMessage?: string }).statusMessage
      ?? 'Das Einlösen hat nicht geklappt. Bitte versuch es noch einmal.'
  } finally {
    sendet.value = false
  }
}

useHead({ title: 'Invite-Code' })
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AppHeader />

    <UContainer class="flex w-full flex-1 flex-col items-center justify-center py-20">
      <div class="w-full max-w-sm">
        <!-- Ohne offene Anmeldung ist diese Seite gegenstandslos. Kein Fehlerbild,
             sondern der Weg zurück zur Anmeldung: Wer hier direkt hereinstolpert,
             hat schlicht den ersten Schritt nicht gemacht. -->
        <template v-if="keinLogin">
          <h1 class="text-xl font-semibold">Erst anmelden</h1>
          <p class="mt-2 text-sm text-muted">
            Um einen Invite-Code einzulösen, meld dich zuerst mit Google oder Apple an.
          </p>
          <UButton class="mt-6" to="/" block color="neutral" variant="subtle">
            Zur Anmeldung
          </UButton>
        </template>

        <template v-else>
          <h1 class="text-xl font-semibold">Fast geschafft</h1>
          <p class="mt-2 text-sm text-muted">
            Du bist mit {{ verfahren }} angemeldet. Für dein Konto brauchst du einmalig
            einen Invite-Code von der Person, die dich eingeladen hat.
          </p>

          <form class="mt-8 flex flex-col gap-4" @submit.prevent="einloesen">
            <UFormField label="Invite-Code" required>
              <UInput
                v-model="code"
                autofocus
                autocomplete="off"
                spellcheck="false"
                placeholder="Code einfügen"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Anzeigename"
              help="So wirst du begrüßt. Später jederzeit änderbar."
            >
              <UInput v-model="anzeigename" placeholder="Dein Name" class="w-full" />
            </UFormField>

            <UAlert
              v-if="fehler"
              color="error"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :description="fehler"
            />

            <UButton type="submit" block size="lg" :loading="sendet" :disabled="!code.trim()">
              Code einlösen
            </UButton>
          </form>
        </template>
      </div>
    </UContainer>
  </div>
</template>
