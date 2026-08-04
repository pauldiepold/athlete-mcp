<script setup lang="ts">
// Unaufdringliche Fußzeile auf allen Flächen. Trägt den einzigen sichtbaren Einstieg
// in den Operator-Login (GitHub-OAuth, ADR-0005) — bewusst klein und unten: für den
// Athleten ist er Beiwerk, für den Betreiber der Weg zurück in die Admin-Fläche.
// Ist die Session da, entfällt der Login; der Admin-Eintrag steht dann oben im Header.
const { loggedIn } = useUserSession()
</script>

<template>
  <footer class="mt-auto border-t border-default">
    <UContainer class="flex items-center justify-center gap-4 py-4 text-xs text-dimmed">
      <ULink
        to="https://github.com/pauldiepold/athlete-mcp"
        target="_blank"
        rel="noopener"
        class="flex items-center gap-1 hover:text-default"
      >
        <UIcon name="i-lucide-github" class="size-3.5" />
        athlete-mcp
      </ULink>

      <ULink v-if="!loggedIn" to="/auth/github" external class="hover:text-default">
        Login
      </ULink>
    </UContainer>
  </footer>
</template>
