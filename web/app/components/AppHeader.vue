<script setup lang="ts">
// Gemeinsames Kopfzeilen-Gerüst aller Flächen (Admin wie Athlet): sticky, damit die
// Navigation beim Scrollen erreichbar bleibt, und überall dieselbe Leiste — der
// Operator wechselt zwischen Admin und den Athleten-Ansichten ohne Bruch.
//
// Rechts steht seit ADR-0007 das Konto-Menü: Vorher war das Abmelden eine Sache der
// Admin-Fläche allein, weil nur der Betreiber eine Session hatte. Jetzt hat jeder
// Athlet eine — und muss sie auf jeder Fläche wieder loswerden können, damit das
// Dashboard auch auf einem fremden Gerät gefahrlos zu öffnen ist.
//
// Der Admin-Eintrag hängt an `user.operator`. Das Feld ist reines UI: Wer die Fläche
// tatsächlich sehen darf, entscheidet der Guard in server/middleware/admin.ts bei
// jedem Request neu.
defineProps<{
  /** Setzt den Admin-Eintrag aktiv — nur die Admin-Fläche selbst tut das. */
  aktiv?: boolean
}>()

const { user, loggedIn, clear } = useUserSession()

// Ohne Anzeigename bleibt die Kopfzeile bei „Konto": eine technische ID dort ist
// schlechter als ein neutrales Wort, und den Namen darf der Athlet nachtragen.
const anzeigename = computed(() => user.value?.name?.trim() || 'Konto')

// Abmelden endet auf der Startseite — abgemeldet ist sie die Anmeldung.
async function abmelden() {
  await clear()
  await navigateTo('/')
}
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-default bg-default/80 backdrop-blur">
    <UContainer class="flex flex-wrap items-center gap-3 py-3">
      <slot />

      <div class="ml-auto flex items-center gap-2">
        <UButton
          v-if="user?.operator"
          to="/admin"
          icon="i-lucide-shield"
          :color="aktiv ? 'primary' : 'neutral'"
          :variant="aktiv ? 'soft' : 'ghost'"
          size="sm"
        >Admin</UButton>

        <template v-if="loggedIn">
          <UAvatar :text="anzeigename.charAt(0).toUpperCase()" size="xs" />
          <span class="hidden text-sm text-muted sm:inline">{{ anzeigename }}</span>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-log-out"
            aria-label="Abmelden"
            @click="abmelden"
          >Abmelden</UButton>
        </template>
      </div>
    </UContainer>
  </header>
</template>
