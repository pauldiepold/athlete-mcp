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
