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
const { zustand, lauf, hatKoerperdaten, zeigtVerlaeufe, geladen, uebernimmLauf }
  = useStartseitenZustand()

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
        <!-- Solange ein Pflichtschritt der Einrichtung fehlt (Issue #52), steht sie an
             der Stelle des Dashboards — und ersetzt es ganz, statt sich darüber zu
             legen: Wer Verläufe sähe, hielte die Einrichtung für erledigt. Der
             Verbindungs-Hinweis schweigt dann, weil die Liste dieselben zwei
             Verbindungen schon führt, ausführlicher und mit dem Weg dorthin. -->
        <EinrichtungKarte v-if="zustand === 'einrichtung'" />

        <template v-else>
          <!-- Solange eine Datenquelle fehlt oder kaputt ist (Issue #44). Über den
               Verläufen ein Balken, im Zustand „nicht verbunden" der Inhalt der Seite —
               er trägt beides, weil er beide Male dasselbe sagt: was fehlt und wo man
               es einrichtet. Verschwindet von selbst, sobald alles steht. -->
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
      </template>
    </UContainer>
  </div>
</template>
