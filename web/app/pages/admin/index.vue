<script setup lang="ts">
// Die Operator-Fläche (ADR-0007). Ihr Gegenstand hat sich mit der OAuth-Umstellung
// vollständig gedreht: Vorher listete sie pro Nutzer die beiden URL-Secrets — ein
// Screenshot davon war die Übernahme aller Konten. Jetzt zeigt sie **Identität**:
// welche Konten es gibt, wer dahintersteckt, und welche Einladungen offenstehen.
//
// Zwei Sorten Code, weil zwei Fälle: ein *freier* Code lädt jemanden neu ein, ein
// *kontogebundener* hängt eine Identität an ein bestehendes Konto und ersetzt dessen
// bisherige — der Weg für die Bestandsathleten und der Notausgang, wenn jemandem sein
// Anmeldeverfahren wegbricht.
//
// Der Zugang läuft über den Guard in server/middleware/admin.ts, der bei jedem Request
// neu rechnet; hier gibt es kein zweites Urteil.
import type { Konto, OffenerInvite } from '@shared/identitaet'

const toast = useToast()

useHead({ title: 'Admin' })

const { data, pending, error, refresh } = await useFetch<{
  konten: Konto[]
  invites: OffenerInvite[]
}>('/api/admin/konten')

// Leer heißt frei, gefüllt heißt kontogebunden — ein Feld für beide Sorten, weil sie
// sich genau in dieser einen Angabe unterscheiden.
const gebundenAn = ref('')
const erzeugt = ref(false)

async function kopieren(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: `${label} kopiert`, color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: 'Kopieren fehlgeschlagen', color: 'error', icon: 'i-lucide-x' })
  }
}

async function codeErzeugen() {
  erzeugt.value = true
  try {
    // Ohne Typ-Argument: `$fetch` kennt die Antwort dieser Route aus den generierten
    // Route-Typen und leitet sie ab. Ein explizites `<OffenerInvite>` wäre nicht nur
    // überflüssig, sondern seit Issue #43 ein Typfehler — der OAuth-Wrapper hat die
    // Server-Typen vollständig ins App-Programm gezogen.
    const invite = await $fetch('/api/admin/invites', {
      method: 'POST',
      body: { userId: gebundenAn.value.trim() || undefined },
    })
    gebundenAn.value = ''
    await refresh()
    await kopieren(invite.code, 'Invite-Code')
  } catch (e) {
    toast.add({
      title:
        (e as { statusMessage?: string }).statusMessage
        ?? 'Code konnte nicht erzeugt werden',
      color: 'error',
      icon: 'i-lucide-x',
    })
  } finally {
    erzeugt.value = false
  }
}

const verfahrenLabel = { google: 'Google', apple: 'Apple' } as const
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AppHeader />

    <UContainer class="w-full flex-1 py-10">
      <UAlert
        v-if="error"
        class="mb-6"
        color="error"
        icon="i-lucide-triangle-alert"
        title="Die Admin-Daten konnten nicht geladen werden"
        :description="error.statusMessage || 'Unbekannter Fehler'"
      />
      <div v-else-if="pending" class="text-muted">Lade …</div>

      <template v-else>
        <!-- Einladen -->
        <section class="mb-10">
          <h1 class="mb-1 text-xl font-semibold">Einladen</h1>
          <p class="mb-4 max-w-2xl text-sm text-muted">
            Ohne Konto-Angabe entsteht beim Einlösen ein neues Konto. Mit Konto-Angabe
            wird das bestehende Konto auf die neue Identität umgestellt — seine
            bisherige Anmeldung gilt danach nicht mehr.
          </p>

          <form class="flex flex-wrap items-end gap-3" @submit.prevent="codeErzeugen">
            <UFormField label="Konto (optional)" class="w-72">
              <UInput
                v-model="gebundenAn"
                placeholder="z. B. paul — leer für ein neues Konto"
                autocomplete="off"
                spellcheck="false"
                class="w-full"
              />
            </UFormField>
            <UButton type="submit" :loading="erzeugt" icon="i-lucide-plus">
              Code erzeugen
            </UButton>
          </form>
        </section>

        <!-- Offene Codes -->
        <section class="mb-10">
          <h2 class="mb-1 text-lg font-semibold">Offene Codes</h2>
          <p class="mb-4 max-w-2xl text-sm text-muted">
            Jeder Code ist einmalig und läuft nach 14 Tagen ab. Eingelöste Codes stehen
            nicht hier, sondern unten als Konto mit Identität.
          </p>

          <p v-if="!data?.invites.length" class="text-muted">Kein offener Code.</p>

          <div v-else class="flex flex-col gap-2">
            <UCard
              v-for="invite in data.invites"
              :key="invite.code"
              :ui="{ body: 'p-3 sm:p-4' }"
            >
              <div class="flex flex-wrap items-center gap-3">
                <UBadge
                  :color="invite.userId ? 'primary' : 'neutral'"
                  variant="soft"
                  size="sm"
                >
                  {{ invite.userId ? `Konto ${invite.userId}` : 'Neues Konto' }}
                </UBadge>
                <code class="grow break-all font-mono text-xs">{{ invite.code }}</code>
                <UButton
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  icon="i-lucide-copy"
                  @click="kopieren(invite.code, 'Invite-Code')"
                >
                  Kopieren
                </UButton>
              </div>
            </UCard>
          </div>
        </section>

        <!-- Konten -->
        <section>
          <h2 class="mb-4 text-lg font-semibold">Konten</h2>

          <p v-if="!data?.konten.length" class="text-muted">
            Noch kein Konto eingelöst.
          </p>

          <div v-else class="flex flex-col gap-3">
            <UCard v-for="konto in data.konten" :key="konto.userId">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <UIcon name="i-lucide-user-round" class="size-5 shrink-0 text-muted" />

                <div class="min-w-0 grow">
                  <p class="font-medium">
                    {{ konto.profil?.anzeigename || 'Ohne Anzeigename' }}
                  </p>
                  <p class="truncate text-sm text-muted">
                    {{ konto.profil?.email || 'Keine Adresse hinterlegt' }}
                  </p>
                </div>

                <UBadge v-if="konto.profil" color="neutral" variant="soft" size="sm">
                  {{ verfahrenLabel[konto.profil.provider] }}
                </UBadge>

                <code class="font-mono text-xs text-dimmed">{{ konto.userId }}</code>
              </div>
            </UCard>
          </div>
        </section>
      </template>
    </UContainer>
  </div>
</template>
