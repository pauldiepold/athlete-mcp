<script setup lang="ts">
// Die Anmeldung (ADR-0007). Sie *ist* die Startseite für alle, die nicht angemeldet
// sind — vorher gab es hier eine leere Visitenkarte, weil der Zugang aus einem Link
// bestand, den jemand verschickt hatte.
//
// Zwei Knöpfe, sonst nichts. Kein Feld für eine userId: Die Bestandskonten heißen
// `paul`, `jonas` und so weiter — ein Eingabefeld dafür wäre ein Rate-Angriff mit
// Wörterbuchgröße vier und schwächer als das abgeschaffte View-Secret. Wer der Athlet
// ist, sagt sein Anmeldeverfahren.
//
// Die Ziel-Adresse reist als `redirect` mit, damit ein geteilter Link auf eine
// Wochenseite nach der Anmeldung dort ankommt. Server-seitig wird sie auf lokale
// Pfade eingegrenzt (siehe server/utils/authState.ts).
const route = useRoute()

const ziel = computed(() => {
  const wert = route.query.redirect
  return typeof wert === 'string' && wert.startsWith('/') ? wert : undefined
})

function loginUrl(provider: 'google' | 'apple'): string {
  const query = ziel.value ? `?redirect=${encodeURIComponent(ziel.value)}` : ''
  return `/auth/${provider}${query}`
}

// Ein abgebrochener oder fehlgeschlagener Provider-Login landet wieder hier — mit
// einem Hinweis statt einer Fehlerseite, damit der zweite Versuch einen Klick kostet.
const fehler = computed(() => route.query.fehler === 'anmeldung')

useHead({ title: 'Anmelden · athlete-mcp' })
</script>

<template>
  <UContainer class="flex w-full flex-1 flex-col items-center justify-center py-20">
    <div class="w-full max-w-sm text-center">
      <h1 class="text-xl font-semibold">athlete-mcp</h1>
      <p class="mt-2 text-sm text-muted">
        Deine Fläche für Körperdaten und Trainingssteuerung.
      </p>

      <UAlert
        v-if="fehler"
        class="mt-6 text-left"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Die Anmeldung hat nicht geklappt"
        description="Bitte versuch es noch einmal."
      />

      <div class="mt-8 flex flex-col gap-3">
        <UButton
          :to="loginUrl('google')"
          external
          block
          size="lg"
          color="neutral"
          variant="subtle"
          icon="i-lucide-log-in"
        >Mit Google anmelden</UButton>

        <UButton
          :to="loginUrl('apple')"
          external
          block
          size="lg"
          color="neutral"
          variant="subtle"
          icon="i-lucide-apple"
        >Mit Apple anmelden</UButton>
      </div>

      <p class="mt-8 text-xs text-dimmed">
        Der Zugang läuft auf Einladung: Beim ersten Mal brauchst du einen Invite-Code
        vom Operator.
      </p>
    </div>
  </UContainer>
</template>
