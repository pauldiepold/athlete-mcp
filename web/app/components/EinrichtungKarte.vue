<script setup lang="ts">
import { ERSTKONTAKT_SATZ } from '@shared/steuerung/erstkontakt'
import type { EinrichtungSchrittId } from '#shared/einrichtung'

// Die **Einrichtung** (Issue #52): die vier Schritte, die ein neues Konto vom Login
// bis zum ersten Steuerungsplan führen — mit echtem Zustand, damit ablesbar ist, was
// noch fehlt.
//
// Sie steht auf `/` an der Stelle, an der später das Dashboard steht, und verschwindet
// dort, sobald alle Pflichtschritte stehen. In den Einstellungen bleibt sie: Wer Final
// Surge später nachreichen will, findet den Weg dort — und nicht über einen Hinweis,
// den es dann nicht mehr gibt.
//
// **Kein Assistent.** Keine erzwungene Reihenfolge, kein Weiter-Knopf, nichts
// gespeichert: Jeder Haken ist abgeleitet (siehe `shared/einrichtung.ts`). Der einzige
// Schritt, dessen Erfolg die Weboberfläche sonst gar nicht sähe, ist das Onboarding —
// deshalb hängt er am vorhandenen Steuerungsplan und nicht an einem „hab ich gemacht".
const props = defineProps<{
  /**
   * Steht die Liste in den Einstellungen? Dann führen die beiden Verbindungs-Schritte
   * nicht dorthin, wo der Athlet schon ist — die Karten stehen unter ihr auf derselben
   * Seite.
   */
  inEinstellungen?: boolean
}>()

const { schritte, pflichtSchrittOffen, mcpUrl } = useEinrichtung()

function schritt(id: EinrichtungSchrittId) {
  return schritte.value.find(s => s.id === id)!
}

const nummer = (id: EinrichtungSchrittId) =>
  schritte.value.findIndex(s => s.id === id) + 1

/**
 * In den Einstellungen bleiben auch erledigte Schritte aufgeklappt: Dort ist die
 * Liste ein Nachschlagewerk, und die MCP-URL wird ausgerechnet dann wieder gebraucht,
 * wenn der Connector schon einmal stand.
 */
const ausfuehrlich = computed(() => props.inEinstellungen === true)
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">Einrichtung</h2>
      <p class="mt-1 text-sm text-muted">
        <template v-if="pflichtSchrittOffen">
          Vier Schritte bis zur laufenden Steuerung. Die Reihenfolge ist eine
          Empfehlung — jeden kannst du einzeln machen und jederzeit nachholen.
        </template>
        <template v-else>
          Alles Nötige steht. Was noch offen ist, brauchst du nur, wenn du es willst —
          nachholen kannst du es hier jederzeit.
        </template>
      </p>
    </template>

    <ul class="divide-y divide-default">
      <EinrichtungSchrittZeile
        :nummer="nummer('garmin')"
        titel="Garmin verbinden"
        :erledigt="schritt('garmin').erledigt"
        :ausfuehrlich="ausfuehrlich"
        :optional="schritt('garmin').optional"
      >
        <p>
          Deine täglichen Körperdaten — Schlaf, HRV, Belastung. Direkt nach dem
          Verbinden holen wir die letzten 30 Tage; das läuft im Hintergrund weiter,
          während du die übrigen Schritte machst. Ohne Garmin bleibt das Dashboard
          leer, alles andere funktioniert.
        </p>
        <EinrichtungVerbindungsWeg :in-einstellungen="inEinstellungen" />
      </EinrichtungSchrittZeile>

      <EinrichtungSchrittZeile
        :nummer="nummer('finalsurge')"
        titel="Final Surge verbinden"
        :erledigt="schritt('finalsurge').erledigt"
        :ausfuehrlich="ausfuehrlich"
        :optional="schritt('finalsurge').optional"
      >
        <p>
          Der Trainingsplan deines Coaches. Wenn du keinen hast und dein Training selbst
          steuerst, überspring diesen Schritt — dir fehlt dann nichts.
        </p>
        <EinrichtungVerbindungsWeg :in-einstellungen="inEinstellungen" />
      </EinrichtungSchrittZeile>

      <EinrichtungSchrittZeile
        :nummer="nummer('connector')"
        titel="Connector in Claude hinzufügen"
        :erledigt="schritt('connector').erledigt"
        :ausfuehrlich="ausfuehrlich"
        :optional="schritt('connector').optional"
      >
        <p>
          Ohne ihn kommt Claude nicht an deine Daten. In Claude: Einstellungen →
          Connectors → Custom Connector hinzufügen, dann diese Adresse einsetzen und
          den Zugriff freigeben.
        </p>

        <!-- Die URL erst, wenn sie da ist: Ein Kopieren-Knopf an einer leeren Zeile
             legt stillschweigend nichts in die Zwischenablage. -->
        <KopierZeile v-if="mcpUrl" :text="mcpUrl" label="MCP-Adresse kopieren" />

        <p>
          Im kostenlosen Claude-Plan ist genau <strong>ein</strong> Custom Connector
          möglich — falls dort schon einer hängt, musst du ihn zuerst entfernen.
        </p>
      </EinrichtungSchrittZeile>

      <EinrichtungSchrittZeile
        :nummer="nummer('onboarding')"
        titel="Onboarding in Claude starten"
        :erledigt="schritt('onboarding').erledigt"
        :ausfuehrlich="ausfuehrlich"
        :optional="schritt('onboarding').optional"
      >
        <p>
          Schick diesen Satz in Claude, sobald der Connector steht. Claude fragt dich
          nach deinem Zielrennen und deiner Form und legt daraus deine Steuerung an —
          hier im Browser kannst du sie danach lesen und ändern.
        </p>

        <KopierZeile :text="ERSTKONTAKT_SATZ" label="Erstkontakt-Satz kopieren" />

        <p>
          Nach Zugangsdaten fragt Claude dabei nie — Passwörter und Codes gehören nur
          auf diese Seite.
        </p>
      </EinrichtungSchrittZeile>
    </ul>
  </UCard>
</template>
