<script setup lang="ts">
import { PRODUKTNAME } from '@shared/produkt'

// Gemeinsames Kopfzeilen-Gerüst aller Flächen (Admin wie Athlet): sticky, damit die
// Navigation beim Scrollen erreichbar bleibt, und überall dieselbe Leiste — der
// Operator wechselt zwischen Admin und den Athleten-Ansichten ohne Bruch.
//
// Rechts steht seit ADR-0007 das Konto-Menü: Vorher war das Abmelden eine Sache der
// Admin-Fläche allein, weil nur der Betreiber eine Session hatte. Jetzt hat jeder
// Athlet eine — und muss sie auf jeder Fläche wieder loswerden können, damit das
// Dashboard auch auf einem fremden Gerät gefahrlos zu öffnen ist.
//
// Mit Issue #44 ist aus dem Abmelde-Knopf ein **Menü** geworden: Neben dem Abmelden
// hängen jetzt die Einstellungen daran (Profil und die Verbindungen zu Final Surge und
// Garmin). Sie gehören dorthin und nicht in die Navigation links — die trägt die
// Flächen, mit denen der Athlet täglich arbeitet, nicht das, was er einmal einrichtet.
//
// Mit Issue #60 ist der **Admin-Eintrag** nachgezogen: Er stand als eigener Knopf neben
// dem Menü, also fast in der Hauptnavigation. Die ist die tägliche Fläche des Athleten,
// und der Operator ist zuerst Athlet und nur gelegentlich Operator — im Konto-Menü
// steht er dort, wo auch sonst das hängt, was mit *diesem Konto* zu tun hat statt mit
// dem Training. Er erscheint **nur** für Sessions mit Operator-Rolle; ein ausgegrauter
// Eintrag für alle anderen erklärte eine Rolle, die es für sie nicht gibt.
//
// Das Feld `user.operator` ist dabei reines UI: Wer die Fläche tatsächlich sehen darf,
// entscheidet der Guard in server/middleware/admin.ts bei jedem Request neu.
//
// Ganz links steht seit Issue #59 die **Wortmarke**: Das Produkt heißt „Trainermodus"
// und nicht mehr `athlete-mcp` — ein Repo-Name, der einem Athleten nichts sagt. Sie
// steht auf jeder Fläche, weil auch die anmeldefreien Seiten (Anmeldung, Consent,
// Invite) sagen müssen, wovon sie eigentlich reden.
const { user, loggedIn, clear } = useUserSession()

// Ohne Anzeigename bleibt die Kopfzeile bei „Konto": eine technische ID dort ist
// schlechter als ein neutrales Wort, und den Namen darf der Athlet nachtragen.
const anzeigename = computed(() => user.value?.name?.trim() || 'Konto')

// Abmelden endet auf der Startseite — abgemeldet ist sie die Anmeldung.
async function abmelden() {
  await clear()
  await navigateTo('/')
}

// Der Anzeigename steht als Kopfzeile im Menü selbst: Auf dem Handy ist neben dem
// Avatar kein Platz für ihn, und „mit welchem Konto bin ich hier eigentlich" ist genau
// die Frage, die man beim Öffnen dieses Menüs stellt.
// Admin steht in einer **eigenen Gruppe** über den Einstellungen: Ein Rollenwechsel ist
// etwas anderes als eine Einstellung an diesem Konto, und die Trennlinie sagt das ohne
// ein Wort. Für alle anderen fehlt die Gruppe ganz.
const menue = computed(() => [
  [{ label: anzeigename.value, type: 'label' as const }],
  ...(user.value?.operator
    ? [[{ label: 'Admin', icon: 'i-lucide-shield', to: '/admin' }]]
    : []),
  [
    { label: 'Einstellungen', icon: 'i-lucide-settings', to: '/einstellungen' },
    { label: 'Abmelden', icon: 'i-lucide-log-out', onSelect: abmelden },
  ],
])
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-default bg-default/80 backdrop-blur">
    <UContainer class="flex flex-wrap items-center gap-3 py-3">
      <ULink to="/" class="shrink-0 font-semibold text-highlighted">{{ PRODUKTNAME }}</ULink>

      <slot />

      <div class="ml-auto flex items-center gap-2">
        <UDropdownMenu v-if="loggedIn" :items="menue">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            trailing-icon="i-lucide-chevron-down"
            :aria-label="`Konto-Menü für ${anzeigename}`"
          >
            <UAvatar :text="anzeigename.charAt(0).toUpperCase()" size="xs" />
            <span class="hidden text-sm sm:inline">{{ anzeigename }}</span>
          </UButton>
        </UDropdownMenu>
      </div>
    </UContainer>
  </header>
</template>
