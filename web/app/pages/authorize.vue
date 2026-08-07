<script setup lang="ts">
import { fehlerMeldung } from '#shared/fehlerMeldung'
import { PRODUKTNAME } from '@shared/produkt'

// Der Consent-Screen — die einzige Stelle, an der ein Connector Zugriff auf die Daten
// eines Athleten bekommt (Issue #43, ADR-0007).
//
// Dass diese Fläche eine Nuxt-Seite ist und keine handgeschriebene HTML-Antwort aus
// dem Worker, ist der eigentliche Ertrag von Spike #37: `/authorize` ist der eine
// OAuth-Endpunkt, den der Provider nicht selbst beantwortet, und er landet über den
// `defaultHandler` ganz normal in Nitro. Also liegt er da, wo die Anmeldung und alle
// anderen Flächen liegen.
//
// Er erscheint bei **jeder** Autorisierung. Ein „diesen Client kennst du schon"-
// Kurzschluss würde genau das wegoptimieren, wofür der Bildschirm da ist: dass die
// Freigabe eine bewusste Handlung ist. In der Praxis ist das einmal pro
// Connector-Einrichtung.
//
// Die Anmeldung erledigt der globale Guard (`middleware/auth.global.ts`): Wer hier
// abgemeldet ankommt, landet mit `?redirect=/authorize?…` auf der Anmeldung und kommt
// nach dem Login mit derselben Anfrage zurück. Diese Seite sieht deshalb nur
// angemeldete Athleten und braucht keinen eigenen Login-Zweig.
//
// Die Autorisierungs-Anfrage reist als Query mit — von hier an beide API-Endpunkte
// weitergereicht, die sie jeweils frisch vom Provider parsen lassen. Kein
// Zwischenspeicher, der ablaufen oder überschrieben werden könnte.
const route = useRoute()
const { user } = useUserSession()

const { data: anfrage, error: ladeFehler } = await useFetch('/api/oauth/anfrage', {
  query: route.query,
})

// Ein Abbruch gehört dem Client, nicht dem Athleten: Er erfährt ihn an seiner
// Redirect-URI. Für den Athleten ist das ein Durchreise-Bildschirm.
watchEffect(() => {
  if (anfrage.value?.art === 'abbruch') {
    navigateTo(anfrage.value.redirectTo, { external: true, replace: true })
  }
})

const sendet = ref<'freigabe' | 'ablehnung' | null>(null)
const fehler = ref<string | null>(null)

async function entscheiden(zustimmung: boolean) {
  sendet.value = zustimmung ? 'freigabe' : 'ablehnung'
  fehler.value = null
  try {
    const antwort = await $fetch('/api/oauth/freigabe', {
      method: 'POST',
      query: route.query,
      body: { zustimmung },
    })

    if (antwort.art === 'fehler') {
      fehler.value = antwort.meldung
      return
    }

    // Zurück zum Client — mit Code oder mit `error`, je nach Entscheidung.
    await navigateTo(antwort.redirectTo, { external: true })
  } catch (e) {
    fehler.value = fehlerMeldung(e, 'Das hat nicht geklappt. Bitte versuch es noch einmal.')
    sendet.value = null
  }
}

useHead({ title: 'Zugriff freigeben' })
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AppHeader />

    <UContainer class="flex w-full flex-1 flex-col items-center justify-center py-20">
      <div class="w-full max-w-md">
        <!-- Ohne lesbare Anfrage gibt es nichts zu entscheiden. Es gibt hier auch kein
             Ziel, an das man umleiten dürfte: Wer keine geprüfte Redirect-URI hat,
             bekommt keine Weiterleitung, sondern eine Meldung. -->
        <template v-if="ladeFehler || anfrage?.art === 'fehler'">
          <h1 class="text-xl font-semibold">Diese Anfrage geht nicht durch</h1>
          <p class="mt-2 text-sm text-muted">
            {{ anfrage?.art === 'fehler' ? anfrage.meldung : 'Die Autorisierungs-Anfrage ist unvollständig oder ungültig.' }}
          </p>
          <p class="mt-4 text-sm text-muted">
            Richte den Connector in Claude noch einmal ein. Bleibt es dabei, stimmt
            etwas an der eingetragenen Adresse nicht.
          </p>
          <UButton class="mt-6" to="/" block color="neutral" variant="subtle">
            Zur Startseite
          </UButton>
        </template>

        <!-- Der Abbruch ist unterwegs zum Client; hier steht nur, was gerade passiert. -->
        <template v-else-if="anfrage?.art === 'abbruch'">
          <p class="text-sm text-muted">Einen Moment — zurück zur Anwendung …</p>
        </template>

        <template v-else-if="anfrage?.art === 'anfrage'">
          <h1 class="text-xl font-semibold">Zugriff freigeben</h1>

          <p class="mt-2 text-sm text-muted">
            <strong>{{ anfrage.clientName ?? 'Eine Anwendung' }}</strong> möchte auf
            dein Konto im {{ PRODUKTNAME }} zugreifen — angemeldet als
            <strong>{{ user?.name || user?.email || 'du' }}</strong>.
          </p>

          <!-- Was der Connector kann, in Klartext statt als Scope-Bezeichner: Die Tools
               unterscheiden heute nicht nach Rechten, also wäre eine feinere Liste eine
               Behauptung, die das System nicht einlöst. -->
          <div class="mt-6 rounded-lg border border-default p-4">
            <p class="text-sm font-medium">Damit kann {{ anfrage.clientName ?? 'die Anwendung' }}:</p>
            <ul class="mt-3 flex flex-col gap-2 text-sm text-muted">
              <li class="flex gap-2">
                <UIcon name="i-lucide-heart-pulse" class="mt-0.5 size-4 shrink-0" />
                <span>Deine Körperdaten aus Garmin lesen</span>
              </li>
              <li class="flex gap-2">
                <UIcon name="i-lucide-calendar-days" class="mt-0.5 size-4 shrink-0" />
                <span>Deinen Trainingsplan aus Final Surge lesen</span>
              </li>
              <li class="flex gap-2">
                <UIcon name="i-lucide-pencil-line" class="mt-0.5 size-4 shrink-0" />
                <span>Dein Trainingsbuch — Grundlagen und Wochen — lesen <strong>und schreiben</strong></span>
              </li>
            </ul>
          </div>

          <p class="mt-4 text-xs text-dimmed">
            Der Code geht an <code>{{ anfrage.redirectHost }}</code>.
            <template v-if="anfrage.scopes.length">
              Angefragter Scope: <code>{{ anfrage.scopes.join(' ') }}</code>.
            </template>
          </p>

          <UAlert
            v-if="fehler"
            class="mt-6"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :description="fehler"
          />

          <div class="mt-8 flex flex-col gap-3">
            <UButton
              block
              size="lg"
              :loading="sendet === 'freigabe'"
              :disabled="sendet !== null"
              @click="entscheiden(true)"
            >
              Zugriff freigeben
            </UButton>
            <UButton
              block
              size="lg"
              color="neutral"
              variant="subtle"
              :loading="sendet === 'ablehnung'"
              :disabled="sendet !== null"
              @click="entscheiden(false)"
            >
              Ablehnen
            </UButton>
          </div>

          <p class="mt-6 text-xs text-dimmed">
            <template v-if="anfrage.policyUri || anfrage.tosUri">
              Angaben der Anwendung:
              <ULink v-if="anfrage.policyUri" :to="anfrage.policyUri" target="_blank">Datenschutz</ULink>
              <template v-if="anfrage.policyUri && anfrage.tosUri"> · </template>
              <ULink v-if="anfrage.tosUri" :to="anfrage.tosUri" target="_blank">Nutzungsbedingungen</ULink>.
            </template>
            Name und Links stammen aus der Selbstregistrierung der Anwendung und sind
            ungeprüft — verlässlich ist nur die Adresse, an die der Code geht.
          </p>
        </template>
      </div>
    </UContainer>
  </div>
</template>
