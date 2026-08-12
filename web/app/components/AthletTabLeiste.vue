<script setup lang="ts">
// Die Navigation auf dem Handy: eine Leiste am unteren Rand, drei gleich breite Ziele,
// Icon über dem Wort.
//
// **Warum nicht oben:** In der Kopfzeile blieb bei 375 px neben Wortmarke und
// Konto-Menü nur Platz für die nackten Icons — ein Notizblock und eine Pulslinie, die
// niemand ohne Vorwissen als „Trainingsbuch" und „Körperdaten" liest. Untereinander
// gestapelt passt das Wort mit; „Trainingsbuch" ist die längste Fläche und trägt sich
// in einem Drittel der Breite problemlos.
//
// **Der Start ist wieder ein Ziel.** Er war seit Issue #60 nur noch die Wortmarke links
// — sichtbar, aber nirgends als Weg beschriftet. Hier steht er als erster Tab; die
// Wortmarke bleibt zusätzlich, was sie war.
//
// **Sticky statt fixed:** Die Leiste liegt im Fluss der Spalte aus app.vue, direkt über
// der Fußzeile. Damit klebt sie beim Scrollen unten, gibt aber am Seitenende den Platz
// für die Fußzeile frei — und braucht kein Freihalte-Padding am Inhalt, das jede Seite
// einzeln hätte setzen müssen.
//
// Ab `sm` verschwindet sie: Dort ist die Kopfzeile breit genug für dieselben Flächen
// als beschriftete Knöpfe (AthletHeader).
const route = useRoute()
const { loggedIn } = useUserSession()

const tabs = [START_FLAECHE, ...ATHLET_FLAECHEN]

// Ohne Session gibt es nichts zu navigieren — `/` ist dann die Anmeldung.
const sichtbar = computed(() => loggedIn.value && hatAthletNavigation(route.path))

const aktiv = computed(() => flaecheFuerPfad(route.path))
</script>

<template>
  <nav
    v-if="sichtbar"
    class="sticky bottom-0 z-10 border-t border-default bg-default/90 backdrop-blur sm:hidden"
    aria-label="Hauptnavigation"
  >
    <!-- `pb-[env(safe-area-inset-bottom)]` hält die Leiste über der Home-Indicator-Zeile
         von iPhones — sonst liegt das unterste Drittel der Trefferfläche unter einer
         Geste, die die App verlässt. -->
    <ul class="flex pb-[env(safe-area-inset-bottom)]">
      <li v-for="tab in tabs" :key="tab.bereich" class="flex-1">
        <ULink
          :to="tab.to"
          class="flex flex-col items-center gap-0.5 py-2 text-xs transition-colors"
          :class="aktiv === tab.bereich ? 'text-primary' : 'text-muted hover:text-default'"
          :aria-current="aktiv === tab.bereich ? 'page' : undefined"
        >
          <UIcon :name="tab.icon" class="size-5" />
          {{ tab.label }}
        </ULink>
      </li>
    </ul>
  </nav>
</template>
