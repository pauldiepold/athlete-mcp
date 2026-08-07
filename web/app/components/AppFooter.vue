<script setup lang="ts">
import { PRODUKTNAME } from '@shared/produkt'

// Unaufdringliche Fußzeile auf allen Flächen.
//
// Der Operator-Login stand hier bis ADR-0007 als einziger sichtbarer Einstieg — er war
// der Einzige mit einer Anmeldung, alle anderen kamen über ihren Link herein. Jetzt
// ist die Anmeldung die Startseite, für Athlet und Operator dieselbe, und die Fußzeile
// trägt nur noch die Herkunft.
//
// Sie nennt dabei den **Produktnamen** und nicht den Repo-Namen (Issue #59): Wohin der
// Link führt, sieht man beim Klicken; was das Ding heißt, soll überall dasselbe sein.
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
        {{ PRODUKTNAME }} auf GitHub
      </ULink>
    </UContainer>
  </footer>
</template>
