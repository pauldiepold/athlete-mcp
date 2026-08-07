<script setup lang="ts">
// Die Wortmarke hängt an **jedem** Seitentitel (Issue #59) — hier einmal statt in
// dreizehn `useHead`-Aufrufen, die alle denselben Suffix vergessen könnten. Die Seiten
// setzen weiter nur ihren eigenen Titel („Körperdaten", „2026-W25"); eine Seite ohne
// eigenen Titel trägt allein den Produktnamen.
import { PRODUKTNAME } from '@shared/produkt'

useHead({
  titleTemplate: (titel) => (titel ? `${titel} · ${PRODUKTNAME}` : PRODUKTNAME),
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <!-- Spalte über die volle Höhe, damit die Fußzeile bei kurzen Seiten (mt-auto)
         unten steht statt mitten im Bild zu kleben. -->
    <div class="flex min-h-dvh flex-col">
      <NuxtPage />
      <AppFooter />
    </div>
  </UApp>
</template>
