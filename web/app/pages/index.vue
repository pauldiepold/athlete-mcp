<script setup lang="ts">
// Die Startseite hat zwei Gesichter (ADR-0007): abgemeldet ist sie die **Anmeldung**,
// angemeldet die **Startseite** des Athleten (bis Issue #60 das Dashboard — die
// Verläufe liegen seither unter `/dashboard`). Vorher war sie eine leere Visitenkarte, weil der
// Zugang aus einem persönlichen Link bestand — mit der Session ist `/` der eine Ort,
// an dem jeder landet, und was er dort sieht, hängt nur davon ab, ob er angemeldet ist.
//
// Bewusst kein Redirect auf eine eigene `/login`-Route: Die Startseite ist auch das
// Ziel nach dem Abmelden, und eine Weiterleitung mitten in diesem Weg würde die
// Adresszeile für nichts umschreiben.
//
// Beide Hälften liegen als Komponenten daneben. Der Datenabruf der Startseite startet
// dadurch erst, wenn sie tatsächlich gerendert wird — abgemeldet wird nichts geladen,
// was ohnehin mit 401 zurückkäme.
const { loggedIn } = useUserSession()
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AthletStartseite v-if="loggedIn" />

    <template v-else>
      <AppHeader />
      <AnmeldeSeite />
    </template>
  </div>
</template>
