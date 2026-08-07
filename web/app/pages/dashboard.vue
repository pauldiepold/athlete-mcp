<script setup lang="ts">
// Die Körperdaten-Verläufe (Issue #60): Zeitraum-Umschalter, Charts, Wochen-Sicht —
// inhaltlich unverändert das, was bis hierher auf `/` stand.
//
// Der **Pfad** heißt weiter `/dashboard`, obwohl die Fläche in der Navigation
// „Körperdaten" heißt: Pfade liest niemand vor, und ein Umbenennen bräche jeden
// geteilten Link und jede Adresse, die schon in einem Chat steht.
//
// Anders als `/` hat diese Seite **kein zweites Gesicht** — abgemeldet greift die
// globale Auth-Middleware und schickt auf die Anmeldung, mit dieser Adresse als
// `redirect`. Deshalb steht hier kein `loggedIn`-Zweig.
//
// Auch **kein** `useStartseitenZustand`: Der Nachfrage-Takt der Erstbefüllung gehört
// zur Startseite, wo die Erstbefüllung angestoßen wird. Wer hierher kommt, hat
// Körperdaten — und ein zweiter Timer auf denselben Abrufen wäre nur ein zweiter
// Wahrheitsort für dieselbe Frage.
useHead({ title: 'Körperdaten' })
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AthletHeader bereich="koerperdaten" />

    <UContainer class="w-full max-w-5xl flex-1 py-6">
      <KoerperdatenVerlaeufe />
    </UContainer>
  </div>
</template>
