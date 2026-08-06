<script setup lang="ts">
// Die öffentliche Startseite (ADR-0007, Issue #49). Sie *ist* die Startseite für alle,
// die nicht angemeldet sind — vorher gab es hier eine leere Visitenkarte, weil der
// Zugang aus einem Link bestand, den jemand verschickt hatte.
//
// Ihr Job ist nicht, jemanden durch die Einrichtung zu führen, sondern ihn **vorher
// abzuweisen**, wenn die Voraussetzungen fehlen. Der teuerste Fehlweg ist ein Athlet,
// der einen Invite-Code einlöst, Garmin verbindet und dann merkt, dass er den Connector
// gar nicht hinzufügen kann. Deshalb erst der Nutzen, dann die Liste dessen, was man
// braucht — und deshalb hier keine Schritt-für-Schritt-Anleitung: Die existiert genau
// einmal, hinter dem Login in den Einstellungen. Eine öffentliche Zweitfassung wäre die
// erste, die veraltet.
//
// Kein Wort über Plugins oder Skills zum Installieren: Es gibt keine (ADR-0008).
//
// Zwei Anmeldeknöpfe, sonst nichts. Kein Feld für eine userId: Die Bestandskonten heißen
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

// Jede Voraussetzung sagt selbst, wie verbindlich sie ist. Ohne diese Marke stünde
// Final Surge gleichberechtigt neben dem Claude-Konto — und jemand ohne Coach hielte
// sich für ausgeschlossen, obwohl ihm nichts fehlt.
const voraussetzungen = [
  {
    name: 'Ein Claude-Konto',
    marke: 'nötig',
    farbe: 'primary' as const,
    icon: 'i-lucide-sparkles',
    text: 'Der kostenlose Plan genügt. Er erlaubt allerdings genau einen Custom '
      + 'Connector — wer dort schon einen hat, müsste ihn ersetzen.',
  },
  {
    name: 'Ein Invite-Code',
    marke: 'nötig',
    farbe: 'primary' as const,
    icon: 'i-lucide-ticket',
    text: 'Der Zugang läuft auf Einladung. Ohne Code vom Operator entsteht beim ersten '
      + 'Anmelden kein Konto.',
  },
  {
    name: 'Ein Garmin-Konto',
    marke: 'empfohlen',
    farbe: 'neutral' as const,
    icon: 'i-lucide-watch',
    text: 'Von dort kommen Schlaf, HRV und Belastung. Es geht auch ohne — dann bleibt '
      + 'der Körperdaten-Teil leer.',
  },
  {
    name: 'Final Surge',
    marke: 'nur mit Coach',
    farbe: 'neutral' as const,
    icon: 'i-lucide-clipboard-list',
    text: 'Nur nötig, wenn ein Coach deinen Plan dort pflegt. Trainierst du nach '
      + 'eigenem Plan, brauchst du es nicht.',
  },
]

useHead({ title: 'athlete-mcp' })
</script>

<template>
  <UContainer class="flex w-full flex-1 flex-col items-center py-16">
    <div class="w-full max-w-xl">
      <div class="text-center">
        <h1 class="text-2xl font-semibold">athlete-mcp</h1>
        <p class="mt-3 text-muted">
          Deine Trainingsdaten dort, wo du ohnehin nachdenkst: Claude liest den Plan
          deines Coaches, deine täglichen Körperdaten und deine eigene Steuerung —
          live, ohne dass du etwas abtippst oder Screenshots hochlädst.
        </p>
        <p class="mt-3 text-sm text-muted">
          Du fragst „passt der lange Lauf morgen zu meinem Schlaf der letzten Woche?“
          und bekommst eine Antwort, die deine Zahlen kennt. Was du festlegst, schreibt
          Claude in deine Steuerung zurück — im Browser siehst du dasselbe.
        </p>
      </div>

      <div class="mt-10">
        <h2 class="text-sm font-semibold">Was du dafür brauchst</h2>

        <ul class="mt-3 flex flex-col gap-4">
          <li v-for="v in voraussetzungen" :key="v.name" class="flex gap-3">
            <UIcon :name="v.icon" class="mt-0.5 size-5 shrink-0 text-dimmed" />
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ v.name }}</span>
                <UBadge :color="v.farbe" variant="subtle" size="sm">{{ v.marke }}</UBadge>
              </div>
              <p class="mt-1 text-sm text-muted">{{ v.text }}</p>
            </div>
          </li>
        </ul>
      </div>

      <UAlert
        v-if="fehler"
        class="mt-10"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Die Anmeldung hat nicht geklappt"
        description="Bitte versuch es noch einmal."
      />

      <div class="mx-auto mt-10 flex max-w-sm flex-col gap-3">
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

        <p class="text-center text-xs text-dimmed">
          Beim ersten Anmelden fragen wir nach deinem Invite-Code.
        </p>
      </div>
    </div>
  </UContainer>
</template>
