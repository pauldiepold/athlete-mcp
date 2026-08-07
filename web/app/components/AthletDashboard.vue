<script setup lang="ts">
// Was ein angemeldeter Athlet auf `/` sieht (Issue #24, ausgebaut in #25 und #51).
//
// Eine Komponente und keine eigene Seite, weil `/` zwei Gesichter hat: abgemeldet die
// Anmeldung, angemeldet dieses Dashboard (siehe pages/index.vue). Seit ADR-0007 steht
// kein Secret mehr im Pfad — wer der Athlet ist, sagt die Session, server-seitig.
//
// Seit Issue #51 entscheidet sie an **vorhandenen Körperdaten**, was sie zeigt, und
// nicht am Verbindungszustand: Zwischen beidem liegt die *Erstbefüllung*, und am
// Verbinden aufgehängt zeigte die Seite direkt nach dem Verbinden ein leeres Dashboard
// — nicht zu unterscheiden von einem kaputten. Welcher Zustand gilt, rechnet die reine
// `startseitenZustand`; hier steht nur, was dann nebeneinander liegt.
//
// Die Kopfzeile steht über allen Zuständen: Die Steuerung braucht überhaupt keine
// externe Verbindung und muss auch aus einem datenlosen Konto erreichbar bleiben — ein
// neues Konto ist ab Sekunde eins nutzbar.
const {
  zustand,
  lauf,
  hatKoerperdaten,
  zeigtVerlaeufe,
  einrichtungOffen,
  geladen,
  uebernimmLauf,
} = useStartseitenZustand()

// Der Titel steht hier und nicht bei den Verläufen: Er gilt für alle vier Zustände,
// und ein datenloses Konto soll im Tab nicht namenlos stehen.
useHead({ title: 'Körperdaten' })
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AthletHeader bereich="dashboard" />

    <UContainer class="w-full max-w-5xl flex-1 py-6">
      <!-- Vor der ersten Antwort bleibt die Fläche leer. Ein Hinweis auf Verdacht wäre
           in der Mehrzahl der Fälle der falsche — und ein kurz aufblitzender
           „richte erst Garmin ein" an ein eingerichtetes Konto ist schlimmer als ein
           Moment Ruhe. -->
      <template v-if="geladen">
        <!-- Die Einrichtung ist seit Issue #57 eine **zweite Achse** und kein Zustand
             mehr: Solange ein Pflichtschritt fehlt (Issue #52), steht sie oben —
             darunter läuft das Dashboard nach seinen eigenen Regeln weiter. Vorher trat
             sie an dessen Stelle, was einem Athleten mit Körperdaten seine Verläufe
             wegnahm. Dass die Einrichtung offen ist, sagt jetzt die Karte selbst: durch
             ihre Position, ihre Zahl und den einen aufgeklappten Schritt.

             Der Verbindungs-Hinweis steht daneben statt zu schweigen: Er schwieg,
             solange die Einrichtung dieselben zwei Verbindungen ausführlicher führte —
             auf der Startseite sind ihre Zeilen jetzt zugeklappt, und mit ihnen der Weg
             in die Einstellungen. Eine unterbrochene Garmin-Verbindung stünde sonst
             nirgends, solange ein Pflichtschritt offen ist. -->
        <EinrichtungKarte v-if="einrichtungOffen" class="mb-6" />
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

        <KoerperdatenVerlaeufe v-if="zeigtVerlaeufe" />
      </template>
    </UContainer>
  </div>
</template>
