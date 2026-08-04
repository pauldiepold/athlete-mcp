<script setup lang="ts">
// Gemeinsames Kopfzeilen-Gerüst aller Flächen (Admin wie Athlet): sticky, damit die
// Navigation beim Scrollen erreichbar bleibt, und überall dieselbe Leiste — der
// Operator wechselt zwischen Admin und den Athleten-Ansichten ohne Bruch.
// Erster Eintrag ist der Rücksprung auf die Admin-Fläche, sichtbar nur mit
// Operator-Session (ADR-0005). Ein Athlet mit seinem View-Secret sieht ihn nie.
defineProps<{
  /** Setzt den Admin-Eintrag aktiv — nur die Admin-Fläche selbst tut das. */
  aktiv?: boolean
}>()

const { loggedIn } = useUserSession()
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-default bg-default/80 backdrop-blur">
    <UContainer class="flex flex-wrap items-center gap-3 py-3">
      <UButton
        v-if="loggedIn"
        to="/admin"
        icon="i-lucide-shield"
        :color="aktiv ? 'primary' : 'neutral'"
        :variant="aktiv ? 'soft' : 'ghost'"
        size="sm"
      >Admin</UButton>

      <slot />
    </UContainer>
  </header>
</template>
