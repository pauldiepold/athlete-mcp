<script setup lang="ts">
import { PRODUKTNAME } from '@shared/produkt'

// Die öffentliche Startseite (ADR-0007, Issues #49 und #61). Sie *ist* die Startseite
// für alle, die nicht angemeldet sind — vorher gab es hier eine leere Visitenkarte,
// weil der Zugang aus einem Link bestand, den jemand verschickt hatte.
//
// **Sie verkauft nicht mehr den Datenanschluss.** Die erste Fassung stellte „Claude
// liest deine Zahlen" nach vorn — und das ist genau das, was jeder auch mit drei
// Screenshots hinbekommt. Was es woanders nicht gibt, sind die beiden anderen Säulen:
// dass Claude mit den Zahlen auch die Arbeitsweise dazubekommt, und dass es sich an
// den letzten Sonntag erinnert. Deshalb tragen **drei** Säulen die Seite, und die
// Daten sind nur die erste davon.
//
// **Die mittlere Säule bekommt bewusst kein Substantiv.** Jedes Wort dafür —
// *Verfahren*, *Playbook*, *Skill* — erzeugt beim Lesen sofort „muss ich das
// installieren?", und die Antwort ist ausdrücklich nein: Es kommt mit dem Connector
// (ADR-0008). Also wird es beschrieben, nicht benannt. Aus demselben Grund fällt hier
// kein Wort über Plugins oder hochzuladende Skills.
//
// **Der Hero-Dialog beweist Erinnerung, nicht Datenzugriff.** Zwei Runden mit einem
// sichtbaren Rückbezug auf ein früheres Gespräch — eine einzelne Frage-Antwort-Runde
// zeigt nur, dass Zahlen vorliegen, und das ist die schwächste der drei Säulen.
//
// **Das Dashboard steht klein und ohne Bild.** Bilder gewinnen gegen Text: ein
// Screenshot der Charts als einziges Bild der Seite kippt das Produkt zum
// Dashboard-Produkt. Wenn überhaupt ein Bild, dann der Gesprächsverlauf — und genau
// der ist hier als Text gebaut.
//
// **Die Seite adressiert den eingeladenen Freund, nicht den Fremden.** Kein „Zugang
// anfragen": Es gibt keinen Anfrage-Flow, den so ein Knopf bedienen könnte. Für den,
// der zufällig hier landet, steht stattdessen ein ehrlicher Satz.
//
// **Die Voraussetzungen sind auf zwei Zeilen geschrumpft und unter die Knöpfe
// gewandert.** Garmin und Final Surge standen früher mit in dieser Liste — beide sind
// optional und werden in der Einrichtung ohnehin erklärt; als Voraussetzung getarnt
// schrecken sie ab, und zwar genau die, die ohne Coach oder ohne Uhr trainieren.
//
// **Genau eine öffentliche Schritte-Liste, und die grob.** Sie beantwortet „wie viel
// Arbeit ist das", mehr nicht. Die echte, zählbare Vier-Schritte-Liste existiert
// weiter genau einmal, hinter dem Login. Zwei verschiedene Vierer-Listen für denselben
// Weg widerlegen sich gegenseitig, sobald der Athlet ankommt.
//
// Zwei Anmeldeknöpfe, sonst nichts. Kein Feld für eine userId: Die Bestandskonten
// heißen `paul`, `jonas` und so weiter — ein Eingabefeld dafür wäre ein Rate-Angriff
// mit Wörterbuchgröße vier und schwächer als das abgeschaffte View-Secret. Wer der
// Athlet ist, sagt sein Anmeldeverfahren.
//
// Die Ziel-Adresse reist als `redirect` mit, damit ein geteilter Link auf eine
// Wochenseite nach der Anmeldung dort ankommt. Server-seitig wird sie auf lokale
// Pfade eingegrenzt (siehe server/utils/authState.ts).
const route = useRoute()

const ziel = computed(() => {
  const wert = route.query.redirect
  return typeof wert === 'string' && wert.startsWith('/') ? wert : undefined
})

function loginUrl(provider: 'google' | 'apple'): string {
  const query = ziel.value ? `?redirect=${encodeURIComponent(ziel.value)}` : ''
  return `/auth/${provider}${query}`
}

// Ein abgebrochener oder fehlgeschlagener Provider-Login landet wieder hier — mit
// einem Hinweis statt einer Fehlerseite, damit der zweite Versuch einen Klick kostet.
const fehler = computed(() => route.query.fehler === 'anmeldung')

// Der Dialog steht als Daten und nicht als vier Absätze im Template, damit die
// Sprecher-Zuordnung eine Eigenschaft der Zeile ist und nicht eine Klassenkette, die
// man beim vierten Absatz falsch abschreibt.
//
// Die zweite Runde ist der Punkt der ganzen Seite: Claude fängt nicht bei null an,
// sondern greift eine Sorge auf, die in einem Chat davor gefallen ist. Deshalb kommt
// der Rückbezug in der *ersten* Antwort — wer nur die halbe Seite liest, hat ihn dann
// schon gesehen.
const dialog = [
  { von: 'athlet' as const, text: 'Wie sieht meine Woche aus?' },
  {
    von: 'claude' as const,
    text: 'Letzte Woche hattest du gesagt, die Wade zwickt — wie war der Tempolauf am '
      + 'Donnerstag?',
  },
  { von: 'athlet' as const, text: 'Lief gut, nichts gespürt.' },
  {
    von: 'claude' as const,
    text: 'Dann bleibt der lange Lauf am Sonntag wie geplant bei 28 km. Du hast drei '
      + 'kurze Nächte hinter dir und bist in der zweiten Aufbauwoche — ich würde ihn '
      + 'ruhig angehen und die Pace offenlassen.',
  },
]

// Die drei Säulen. Die mittlere trägt in Überschrift *und* Text kein Substantiv für
// das, was da mitkommt — siehe oben; sie sagt stattdessen selbst, dass nichts zu
// installieren ist, weil genau diese Frage sonst offenbleibt.
const saeulen = [
  {
    icon: 'i-lucide-activity',
    titel: 'Deine Zahlen sind schon da',
    text: 'Schlaf, HRV und Belastung von der Garmin-Uhr, der Trainingsplan deines '
      + 'Coaches, später auch Strava. Ohne Abtippen, ohne Screenshots.',
  },
  {
    icon: 'i-lucide-compass',
    titel: 'Und es weiß, wie man damit umgeht',
    text: 'Claude bekommt nicht nur die Zahlen, sondern auch, wie man sie liest: '
      + 'worauf es in welcher Trainingsphase ankommt, wann ein lockerer Lauf der '
      + 'richtige ist, wann man einen Plan besser in Ruhe lässt. Installieren musst '
      + 'du dafür nichts — das kommt mit der Verbindung.',
  },
  {
    icon: 'i-lucide-bookmark',
    titel: 'Und es erinnert sich',
    text: 'Ziel, Form, Paces, was ihr in den Wochen davor besprochen habt: Jeder neue '
      + 'Chat bringt das wieder mit, statt bei null anzufangen.',
  },
]

// Zwei Zeilen, beide echte Voraussetzungen. Erstes Vorkommen von „Connector"
// überhaupt — deshalb steht die Erklärung schon hier und nicht erst in der
// Einrichtung (Issue #59): Das Wort bleibt stehen, weil es so in Claudes eigener
// Oberfläche steht, aber unerklärt sagt es nichts.
const voraussetzungen = [
  {
    name: 'Ein Claude-Konto',
    text: 'Der kostenlose Plan genügt. Er erlaubt genau einen Custom Connector — so '
      + 'heißt in Claude die Verbindung zu einer fremden Datenquelle.',
  },
  {
    name: 'Ein Einladungscode',
    text: 'Ohne Code von der Person, die dich eingeladen hat, entsteht beim ersten '
      + 'Anmelden kein Konto.',
  },
]

// Der leere Titel setzt den vorherigen zurück: `/` trägt zwei Gesichter, und wer sich
// vom Dashboard abmeldet, landet client-seitig hier — ohne dieses Zurücksetzen bliebe
// „Körperdaten" im Tab stehen. Das `titleTemplate` in app.vue macht daraus den
// Produktnamen allein, was auf der Startseite genau richtig ist.
useHead({ title: '' })
</script>

<template>
  <UContainer class="flex w-full flex-1 flex-col items-center py-16">
    <div class="w-full max-w-xl">
      <div class="text-center">
        <h1 class="text-2xl font-semibold">{{ PRODUKTNAME }}</h1>
        <p class="mt-3 text-muted">
          Ein Gegenüber für dein Training, das deine Daten kennt, weiß wie man sie
          liest — und sich an das letzte Gespräch erinnert.
        </p>
      </div>

      <div class="mt-8 flex flex-col gap-3">
        <div
          v-for="(zeile, i) in dialog"
          :key="i"
          class="flex"
          :class="zeile.von === 'athlet' ? 'justify-end' : 'justify-start'"
        >
          <p
            class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm"
            :class="zeile.von === 'athlet'
              ? 'bg-primary/10 text-default'
              : 'bg-elevated text-muted'"
          >{{ zeile.text }}</p>
        </div>
      </div>

      <ul class="mt-12 flex flex-col gap-6">
        <li v-for="s in saeulen" :key="s.titel" class="flex gap-3">
          <UIcon :name="s.icon" class="mt-0.5 size-5 shrink-0 text-dimmed" />
          <div>
            <h2 class="font-medium">{{ s.titel }}</h2>
            <p class="mt-1 text-sm text-muted">{{ s.text }}</p>
          </div>
        </li>
      </ul>

      <div class="mt-8 flex flex-col gap-2 text-sm text-muted">
        <p class="flex gap-2">
          <UIcon name="i-lucide-line-chart" class="mt-0.5 size-4 shrink-0 text-dimmed" />
          <span>
            Und wenn du selbst hinschauen willst: Schlaf, HRV und Belastung als
            Verläufe, im Browser.
          </span>
        </p>
        <p class="flex gap-2">
          <UIcon name="i-lucide-shield-check" class="mt-0.5 size-4 shrink-0 text-dimmed" />
          <span>Der Plan deines Coaches wird gelesen, nie überschrieben.</span>
        </p>
      </div>

      <p class="mt-10 text-center text-sm font-medium">
        Anmelden · Verbinden · Loslegen
      </p>

      <UAlert
        v-if="fehler"
        class="mt-8"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Die Anmeldung hat nicht geklappt"
        description="Bitte versuch es noch einmal."
      />

      <div class="mx-auto mt-6 flex max-w-sm flex-col gap-3">
        <UButton
          :to="loginUrl('google')"
          external
          block
          size="lg"
          color="neutral"
          variant="subtle"
          icon="i-lucide-log-in"
        >Mit Google anmelden</UButton>

        <UButton
          :to="loginUrl('apple')"
          external
          block
          size="lg"
          color="neutral"
          variant="subtle"
          icon="i-lucide-apple"
        >Mit Apple anmelden</UButton>

        <ul class="mt-2 flex flex-col gap-1 text-xs text-dimmed">
          <li v-for="v in voraussetzungen" :key="v.name">
            <span class="font-medium text-muted">{{ v.name }}</span> — {{ v.text }}
          </li>
        </ul>

        <p class="text-center text-xs text-dimmed">
          Der Zugang läuft über persönliche Einladung.
        </p>
      </div>
    </div>
  </UContainer>
</template>
