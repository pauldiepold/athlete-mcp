<script setup lang="ts">
// Was ein angemeldeter Athlet auf `/` sieht (Issue #24, ausgebaut in #25, #51 und #60).
//
// Eine Komponente und keine eigene Seite, weil `/` zwei Gesichter hat: abgemeldet die
// Anmeldung, angemeldet diese Startseite (siehe pages/index.vue). Seit ADR-0007 steht
// kein Secret mehr im Pfad — wer der Athlet ist, sagt die Session, server-seitig.
//
// **Seit Issue #60 ist das hier nicht mehr das Dashboard.** Die Verläufe liegen unter
// `/dashboard`; hier stehen der Hinweis in den Chat und der aktuelle Stand. Der Grund
// ist eine Ansage über das Produkt: Zentrum ist das Enabling von Claude, und wer nach
// dem Login vor sieben Charts landet, liest die Seite als Chart-Produkt und geht nicht
// in den Chat.
//
// **Genau zwei Blöcke, in jedem Zustand — das ist die tragende Regel.**
//   - Einrichtung offen: die Einrichtung oben, darunter der Körperdaten-Block. Der
//     Hinweis entfällt **komplett**: Wer noch einrichtet, braucht keinen Tipp für ein
//     Gespräch, das er noch gar nicht führen kann.
//   - Alles steht: der Hinweis oben, darunter der Körperdaten-Block. Die Einrichtung
//     verschwindet von `/` (in den Einstellungen bleibt sie).
// Der Wechsel zwischen beiden ist der sichtbare Lohn fürs Fertigwerden — und er
// funktioniert nur, solange nie beides gleichzeitig oben steht.
//
// Der **zweite** Block ist immer derselbe Platz, nur mit wechselndem Inhalt: die
// Kachelzeile, wenn Körperdaten da sind, sonst der Zustand auf dem Weg dorthin
// (Erstbefüllung angestoßen, läuft, oder gar keine Verbindung). Seit Issue #51
// entscheidet darüber nicht der Verbindungszustand, sondern das **Vorhandensein von
// Körperdaten** — dazwischen liegt die Erstbefüllung, und am Verbinden aufgehängt zeigte
// die Seite direkt nach dem Verbinden ein leeres Dashboard, nicht zu unterscheiden von
// einem kaputten. Welcher Zustand gilt, rechnet die reine `startseitenZustand`.
const {
  zustand,
  lauf,
  hatKoerperdaten,
  zeigtKoerperdaten,
  einrichtungOffen,
  geladen,
  uebernimmLauf,
} = useStartseitenZustand()

// Kein eigener Titel: Das `titleTemplate` in app.vue macht daraus den Produktnamen
// allein — auf der Startseite genau richtig, und „Körperdaten" heißt jetzt die andere
// Fläche.
useHead({ title: '' })
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AthletHeader bereich="start" />

    <UContainer class="w-full max-w-5xl flex-1 py-6">
      <!-- Vor der ersten Antwort bleibt die Fläche leer. Ein Hinweis auf Verdacht wäre
           in der Mehrzahl der Fälle der falsche — und ein kurz aufblitzender
           „richte erst Garmin ein" an ein eingerichtetes Konto ist schlimmer als ein
           Moment Ruhe. -->
      <template v-if="geladen">
        <!-- Block 1: die eine Ansage. Entweder die Einrichtung oder der Hinweis,
             nie beides. -->
        <EinrichtungKarte v-if="einrichtungOffen" />
        <ChatHinweis v-else />

        <!-- Block 2: die Körperdaten. Der Verbindungs-Hinweis gehört dazu und steht
             deshalb hier drin: Er meldet eine **unterbrochene** Verbindung, also
             genau, warum unter ihm nichts Aktuelles steht. -->
        <div class="mt-6">
          <VerbindungenHinweis />

          <KoerperdatenLadehinweis
            v-if="zustand === 'laeuft'"
            :mit-daten="hatKoerperdaten"
          />

          <!-- Nur in diesem einen Zustand ein Knopf: Während des Laufs gäbe es nichts
               anzustoßen, und ohne Verbindung führt der Weg in die Einstellungen. -->
          <ErstbefuellungKarte
            v-else-if="zustand === 'keine-daten'"
            :lauf="lauf"
            @gestartet="uebernimmLauf"
          />

          <KoerperdatenStand v-if="zeigtKoerperdaten" />
        </div>
      </template>
    </UContainer>
  </div>
</template>
