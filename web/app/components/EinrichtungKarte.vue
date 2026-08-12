<script setup lang="ts">
import { STARTSATZ } from '@shared/steuerung/startsatz'
import type { Datenquelle } from '@shared/verbindungen'
import type { EinrichtungSchrittId } from '#shared/einrichtung'

// Die **Einrichtung** (Issue #52): die vier Schritte, die ein neues Konto vom Login
// bis zum ersten Steuerungsplan führen — mit echtem Zustand, damit ablesbar ist, was
// noch fehlt.
//
// Sie steht auf `/` **ganz oben**, solange ein Pflichtschritt offen ist, und
// verschwindet dort, sobald alle stehen. Bis Issue #57 trat sie an die Stelle des
// Dashboards — das nahm einem Athleten mit Körperdaten seine Verläufe weg, nur weil
// noch ein Haken fehlte. Die Sorge dahinter (wer Verläufe sieht, hält die Einrichtung
// für erledigt) tragen jetzt die Position, die Zeile „Noch n von m Schritten offen"
// und der eine aufgeklappte Schritt: Die Karte sagt selbst, dass sie noch offen ist.
//
// Seit Issue #60 ist ihr Platz zugleich der des **Chat-Hinweises**: Genau eine Ansage
// steht oben auf der Startseite, und solange die Einrichtung offen ist, ist sie es.
// Der Hinweis entfällt dann komplett — wer noch einrichtet, braucht keinen Tipp für ein
// Gespräch, das er noch gar nicht führen kann.
//
// In den Einstellungen bleibt sie dauerhaft: Wer Final Surge später nachreichen will,
// findet den Weg dort — und nicht über einen Hinweis, den es dann nicht mehr gibt.
//
// **Kein Assistent.** Keine erzwungene Reihenfolge, kein Weiter-Knopf, nichts
// gespeichert: Jeder Haken ist abgeleitet (siehe `shared/einrichtung.ts`). Der einzige
// Schritt, dessen Erfolg die Weboberfläche sonst gar nicht sähe, ist das Anlegen des
// Trainingsbuchs — deshalb hängt er am vorhandenen Steuerungsplan und nicht an einem
// „hab ich gemacht".
const props = defineProps<{
  /**
   * Steht die Liste in den Einstellungen? Dann führen die beiden Verbindungs-Schritte
   * nicht dorthin, wo der Athlet schon ist — die Karten stehen unter ihr auf derselben
   * Seite.
   */
  inEinstellungen?: boolean
}>()

const { schritte, pflichtSchrittOffen, offenePflicht, naechsterOffener, mcpUrl }
  = useEinrichtung()

const { refresh: verbindungenNeu, uebernimmVerbunden } = useVerbindungen()

/**
 * Nach einem geglückten Verbinden den Zustand neu holen, statt ihn zu erraten — die
 * Haken der Liste hängen an den Verbindungen, die Erstbefüllung hat der Server beim
 * Verbinden angestoßen (Issue #48). Dasselbe tut die Einstellungen-Seite für ihre
 * Karten; hier braucht es das noch einmal, weil das Formular jetzt auch in der
 * Einrichtung selbst steht.
 *
 * Und danach das eine, was der Abruf womöglich noch nicht weiß, ausdrücklich setzen:
 * dass **diese** Quelle jetzt verbunden ist. Sonst stand im Schritt „Verbunden" und in
 * seiner Kopfzeile weiter die offene Nummer.
 */
async function verbindungFertig(quelle: Datenquelle) {
  await Promise.all([verbindungenNeu(), refreshNuxtData('koerperdaten-stand')])
  uebernimmVerbunden(quelle)
}

function schritt(id: EinrichtungSchrittId) {
  return schritte.value.find(s => s.id === id)!
}

const nummer = (id: EinrichtungSchrittId) =>
  schritte.value.findIndex(s => s.id === id) + 1

/**
 * Wer aufgeklappt **beginnt** — jede Zeile lässt sich danach selbst öffnen und
 * schließen.
 *
 * In den Einstellungen alle **offenen**: Dort ist die Liste ein Nachschlagewerk, und
 * offen heißt hier „hier ist noch etwas zu tun". Erledigte Schritte klappen zu — sonst
 * steht die ganze Anleitung samt zweier Anmeldeformulare auf einer Seite, deren
 * einziger Zweck an dem Tag das Nachreichen eines einzelnen Schritts ist. Was
 * trotzdem noch einmal gebraucht wird — die MCP-URL beim zweiten Connector —, ist
 * einen Klick auf die Zeile entfernt.
 *
 * Auf der Startseite genau **einer** — der nächste offene Pflichtschritt (Issue #57).
 * Vorher klappte dort jeder offene Schritt auf; über dem Dashboard wäre das eine
 * Textwand vor den Verläufen. Ein Schritt sagt dasselbe: was jetzt dran ist. Die
 * beiden Verbindungen tragen inzwischen ihr Formular im Körper — sie zu Beginn
 * aufzuklappen hieße, zwei Passwortfelder vor die Verläufe zu stellen.
 */
function aufgeklappt(id: EinrichtungSchrittId): boolean {
  return props.inEinstellungen === true
    ? !schritt(id).erledigt
    : naechsterOffener.value === id
}

/**
 * Was noch aussteht — gezählt werden die **Pflicht**-Schritte, denn nur die halten die
 * Karte auf der Startseite.
 *
 * Bewusst ohne „von 4": Zähler und Nenner wären zwei verschiedene Mengen. Wer beide
 * Verbindungen überspringt und den Connector hat, sähe drei Zeilen ohne Haken über
 * „Noch 1 von 4 Schritten offen" — und hielte die Karte für kaputt statt sich selbst
 * für fast fertig.
 */
const fortschritt = computed(() =>
  offenePflicht.value === 1
    ? 'Noch 1 Pflichtschritt offen'
    : `Noch ${offenePflicht.value} Pflichtschritte offen`,
)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="font-semibold">Einrichtung</h2>
        <!-- Die Zahl steht neben dem Titel und nicht im Fließtext: Sie ist das, was
             die Karte oben auf der Startseite behaupten muss — hier ist noch etwas offen,
             und zwar so viel. -->
        <UBadge v-if="pflichtSchrittOffen" color="warning" variant="subtle" size="sm">
          {{ fortschritt }}
        </UBadge>
      </div>
      <p class="mt-1 text-sm text-muted">
        <template v-if="pflichtSchrittOffen">
          Vier Schritte bis zum laufenden Trainingsbuch. Die Reihenfolge ist eine
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
        :aufgeklappt="aufgeklappt('garmin')"
        :optional="schritt('garmin').optional"
      >
        <p>
          Deine täglichen Körperdaten — Schlaf, HRV, Belastung. Direkt nach dem
          Verbinden holen wir die letzten 30 Tage; das läuft im Hintergrund weiter,
          während du die übrigen Schritte machst. Ohne Garmin bleiben deine
          Körperdaten leer, alles andere funktioniert.
        </p>
        <EinrichtungVerbindungsWeg
          :in-einstellungen="inEinstellungen"
          :erledigt="schritt('garmin').erledigt"
          :aktualisieren="() => verbindungFertig('garmin')"
          erfolg="Garmin ist verbunden. Deine Körperdaten der letzten 30 Tage holen wir
            jetzt im Hintergrund — du kannst mit den übrigen Schritten weitermachen."
        >
          <template #default="{ fertig }">
            <VerbindungGarmin @fertig="fertig" />
          </template>
          <!-- Der laufende Abruf im Schritt selbst: Er dauert etwa eine Minute, und wer
               gerade verbunden hat, schaut genau hierhin. Derselbe Streifen wie unter
               der Garmin-Karte in den Einstellungen — es ist derselbe Lauf. -->
          <template #nachlauf>
            <ErstbefuellungKnopf />
          </template>
        </EinrichtungVerbindungsWeg>
      </EinrichtungSchrittZeile>

      <EinrichtungSchrittZeile
        :nummer="nummer('finalsurge')"
        titel="Final Surge verbinden"
        :erledigt="schritt('finalsurge').erledigt"
        :aufgeklappt="aufgeklappt('finalsurge')"
        :optional="schritt('finalsurge').optional"
      >
        <p>
          Der Trainingsplan deines Coaches. Wenn du keinen hast und dein Training selbst
          steuerst, überspring diesen Schritt — dir fehlt dann nichts.
        </p>
        <EinrichtungVerbindungsWeg
          :in-einstellungen="inEinstellungen"
          :erledigt="schritt('finalsurge').erledigt"
          :aktualisieren="() => verbindungFertig('finalsurge')"
          erfolg="Final Surge ist verbunden. Der Plan deines Coaches steht deinem
            Trainingsbuch ab jetzt zur Verfügung."
        >
          <template #default="{ fertig }">
            <VerbindungFinalSurge @fertig="fertig" />
          </template>
        </EinrichtungVerbindungsWeg>
      </EinrichtungSchrittZeile>

      <EinrichtungSchrittZeile
        :nummer="nummer('connector')"
        titel="Connector in Claude hinzufügen"
        :erledigt="schritt('connector').erledigt"
        :aufgeklappt="aufgeklappt('connector')"
        :optional="schritt('connector').optional"
      >
        <!-- „Connector" bleibt stehen und wird einmal erklärt (Issue #59): Das Wort
             steht so in Claudes eigener Oberfläche — wegübersetzt wäre die Anleitung
             nicht mehr befolgbar. Erklärt wird es hier, beim ersten Vorkommen in der
             Einrichtung. -->
        <p>
          Ein <strong>Connector</strong> ist Claudes Weg zu einer fremden Datenquelle —
          das Wort steht so in Claudes Einstellungen. Ohne ihn kommt Claude nicht an
          deine Daten. In Claude: Einstellungen → Connectors → Custom Connector
          hinzufügen, dann diese Adresse einsetzen und den Zugriff freigeben.
        </p>

        <!-- Die URL erst, wenn sie da ist: Ein Kopieren-Knopf an einer leeren Zeile
             legt stillschweigend nichts in die Zwischenablage. -->
        <KopierZeile v-if="mcpUrl" :text="mcpUrl" label="Deine persönliche Adresse kopieren" />

        <p>
          Im kostenlosen Claude-Plan ist genau <strong>ein</strong> Custom Connector
          möglich — falls dort schon einer hängt, musst du ihn zuerst entfernen.
        </p>
      </EinrichtungSchrittZeile>

      <EinrichtungSchrittZeile
        :nummer="nummer('onboarding')"
        titel="Trainingsbuch in Claude anlegen"
        :erledigt="schritt('onboarding').erledigt"
        :aufgeklappt="aufgeklappt('onboarding')"
        :optional="schritt('onboarding').optional"
      >
        <p>
          Schick diesen Satz in Claude, sobald der Connector steht. Claude fragt dich
          nach deinem Zielrennen und deiner Form und legt daraus dein Trainingsbuch an
          — hier im Browser kannst du es danach lesen und ändern.
        </p>

        <KopierZeile :text="STARTSATZ" label="Startsatz kopieren" />

        <p>
          Nach Zugangsdaten fragt Claude dabei nie — Passwörter und Codes gehören nur
          auf diese Seite.
        </p>
      </EinrichtungSchrittZeile>
    </ul>
  </UCard>
</template>
