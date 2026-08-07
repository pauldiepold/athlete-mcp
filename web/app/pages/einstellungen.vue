<script setup lang="ts">
// Die Einstellungen (Issue #44): Profil und Verbindungen an einem Ort, erreichbar über
// das Konto-Menü oben rechts.
//
// **Kein Assistent.** Jede Verbindung ist unabhängig herstellbar und jederzeit
// nachholbar; nichts hier ist ein Tor, durch das man erst hindurch müsste. Ein
// Alles-oder-Nichts-Onboarding hätte den Einstieg ausgerechnet an Garmin gekettet, den
// Schritt mit dem größten Risiko — und die Steuerung, die überhaupt keine externe
// Verbindung braucht, gleich mit blockiert.
//
// Deshalb ist das auch eine gewöhnliche Fläche und kein Bildschirm, der nach dem
// Einlösen des Invite-Codes einmal erscheint: Was hier steht, wird wieder gebraucht —
// wenn ein Passwort sich ändert oder eine Anmeldung abläuft.
const { user, fetch: sessionNeu } = useUserSession()
const { verbindungen, refresh } = useVerbindungen()

const anzeigename = ref(user.value?.name ?? '')
const speichert = ref(false)
const gespeichert = ref(false)
const profilFehler = ref<string | null>(null)

async function profilSpeichern() {
  speichert.value = true
  gespeichert.value = false
  profilFehler.value = null
  try {
    await $fetch('/api/profil', {
      method: 'PUT',
      body: { anzeigename: anzeigename.value },
    })
    // Die Session trägt den Namen fürs UI mit — ohne dieses Nachziehen stünde in der
    // Kopfzeile bis zum nächsten Login der alte.
    await sessionNeu()
    gespeichert.value = true
  } catch (e) {
    profilFehler.value =
      (e as { statusMessage?: string }).statusMessage
      ?? 'Das Speichern hat nicht geklappt. Bitte versuch es noch einmal.'
  } finally {
    speichert.value = false
  }
}

/**
 * Nach einem geglückten Verbinden den Zustand neu holen, statt ihn zu erraten — und
 * die Erstbefüllung gleich mit: Der Server hat sie beim Verbinden angestoßen
 * (Issue #48), sichtbar wird sie erst mit diesem Nachziehen.
 */
async function verbindungFertig() {
  await Promise.all([refresh(), refreshNuxtData('erstbefuellung')])
}

function verbindungVon(quelle: string) {
  return verbindungen.value.find(v => v.quelle === quelle)
}

useHead({ title: 'Einstellungen' })
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AthletHeader bereich="einstellungen" />

    <UContainer class="w-full max-w-2xl flex-1 py-6">
      <h1 class="text-xl font-semibold">Einstellungen</h1>
      <p class="text-sm text-muted">
        Dein Anzeigename und die Verbindungen zu deinen Datenquellen.
      </p>

      <div class="mt-6 flex flex-col gap-4">
        <!-- Die Einrichtung (Issue #52) steht hier oben — und anders als auf der
             Startseite **dauerhaft**, auch wenn alles erledigt ist: Wer Final Surge
             später nachreicht oder seinen Connector neu aufsetzt, findet den Weg
             sonst nirgends mehr. Sie trägt auch den Startsatz aus Issue #50;
             er ist ihr vierter Schritt und stand vorher als eigene Karte hier. -->
        <EinrichtungKarte in-einstellungen />

        <UCard>
          <template #header>
            <h2 class="font-semibold">Profil</h2>
          </template>

          <form class="flex flex-col gap-4" @submit.prevent="profilSpeichern">
            <UFormField
              label="Anzeigename"
              help="So wirst du begrüßt. Leer lassen ist erlaubt."
            >
              <UInput v-model="anzeigename" placeholder="Dein Name" class="w-full" />
            </UFormField>

            <!-- E-Mail-Adresse und Anmeldeverfahren stehen daneben, aber nicht zur
                 Auswahl: Die E-Mail kommt bei jedem Login frisch vom Provider, das
                 Verfahren wechselt über einen Invite-Code (ADR-0007) — nicht über ein
                 Formular. Sie hier trotzdem zu zeigen, beantwortet die Frage „mit
                 welchem Konto bin ich hier eigentlich angemeldet". -->
            <p v-if="user?.email" class="text-sm text-muted">
              Angemeldet als {{ user.email }}
            </p>

            <UAlert
              v-if="profilFehler"
              color="error"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :description="profilFehler"
            />

            <div class="flex items-center justify-end gap-3">
              <span v-if="gespeichert" class="text-sm text-success">Gespeichert.</span>
              <UButton type="submit" :loading="speichert">Speichern</UButton>
            </div>
          </form>
        </UCard>

        <div>
          <h2 class="mt-2 font-semibold">Verbindungen</h2>
          <p class="text-sm text-muted">
            Jede Verbindung steht für sich — du kannst sie einzeln einrichten und
            jederzeit nachholen. Dein Trainingsbuch funktioniert auch ohne sie.
          </p>
        </div>

        <VerbindungKarte
          v-if="verbindungVon('finalsurge')"
          :verbindung="verbindungVon('finalsurge')!"
          wofuer="Der Trainingsplan deines Coaches."
          :aktualisieren="verbindungFertig"
        >
          <template #default="{ fertig }">
            <VerbindungFinalSurge @fertig="fertig" />
          </template>
        </VerbindungKarte>

        <VerbindungKarte
          v-if="verbindungVon('garmin')"
          :verbindung="verbindungVon('garmin')!"
          wofuer="Deine täglichen Körperdaten — Schlaf, HRV, Belastung."
          :aktualisieren="verbindungFertig"
        >
          <template #default="{ fertig }">
            <VerbindungGarmin @fertig="fertig" />
          </template>
          <template #fuss>
            <ErstbefuellungKnopf />
          </template>
        </VerbindungKarte>
      </div>
    </UContainer>
  </div>
</template>
