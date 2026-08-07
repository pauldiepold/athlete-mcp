/**
 * Die Hinweise, was sich **jetzt in Claude** machen lässt (Issue #60) — eine gepflegte
 * statische Liste, aus der die Startseite immer **genau einen** zeigt.
 *
 * **Warum nur einer.** Drei Vorschläge nebeneinander sind ein Menü, und Menüs werden
 * überblättert: Wer wählen soll, wählt nichts. Ein einzelner Satz ist eine Aufforderung
 * — und weil er täglich wechselt, lernt der Athlet die Liste über Wochen trotzdem
 * kennen, ohne sie je als Liste vorgesetzt zu bekommen.
 *
 * **Warum statisch.** Der Hinweis ist Redaktion, kein Zustand: Er hängt nicht daran,
 * was der Athlet heute schon getan hat, und soll es auch nicht — dafür müsste die
 * Startseite den Gesprächsverlauf kennen, den sie nie sieht. Was hier steht, ist die
 * Sammlung der Fragen, die sich mit *diesen* Daten und *diesem* Verfahren lohnen; sie
 * wächst mit dem, was der Connector kann.
 *
 * **Warum ein Satz zum Kopieren.** Derselbe Grund wie beim Startsatz: Ein Hinweis, der
 * nur beschreibt, was ginge, lässt den Athleten die Formulierung selbst finden — und
 * die erste Formulierung entscheidet, ob Claude das Verfahren zieht oder frei
 * assoziiert. Der fertige Satz überspringt das.
 */

export interface ChatHinweis {
  /** Was der Athlet damit erreicht — die Überschrift des Blocks. */
  titel: string
  /** Ein bis zwei Sätze, warum sich das lohnt. */
  text: string
  /** Der Satz, den er in Claude schickt — kopierbar, damit er ihn nicht selbst baut. */
  satz: string
}

/**
 * Die Liste selbst. Reihenfolge ist bedeutungslos — welcher heute dran ist, rechnet
 * `hinweisDesTages` aus dem Datum, nicht aus der Position.
 */
export const CHAT_HINWEISE: ChatHinweis[] = [
  {
    titel: 'Frag nach dem heutigen Tag',
    text: 'Claude liest deinen Schlaf, deine HRV und die geplante Einheit zusammen — '
      + 'und sagt dir, ob der Plan heute passt oder besser lockerer ausfällt.',
    satz: 'Was steht heute an, und passt das zu meinen Körperdaten?',
  },
  {
    titel: 'Lass die Woche planen',
    text: 'Aus dem Coach-Plan, deiner Erholungslage und dem, was ihr zuletzt '
      + 'besprochen habt, entsteht ein Wochenentwurf — den du danach hier im '
      + 'Trainingsbuch nachlesen und ändern kannst.',
    satz: 'Lass uns die kommende Woche planen.',
  },
  {
    titel: 'Erzähl, wie der letzte Lauf war',
    text: 'Was du im Chat erzählst, landet in deinem Trainingsbuch — und ist beim '
      + 'nächsten Gespräch noch da, auch in einem neuen Chat.',
    satz: 'Ich war gerade laufen — ich erzähl dir kurz, wie es war, schreib das bitte '
      + 'in mein Trainingsbuch.',
  },
  {
    titel: 'Prüf, ob du auf Kurs bist',
    text: 'Der Blick über die Wochen statt auf den einzelnen Tag: Wo stehst du '
      + 'gegenüber deinem Zielrennen, und trägt die aktuelle Phase noch?',
    satz: 'Bin ich auf Kurs für mein Zielrennen?',
  },
  {
    titel: 'Sprich einen Wehwehchen-Verdacht an',
    text: 'Ein Zwicken, das du einmal erwähnst, taucht in den Wochen danach von '
      + 'selbst wieder auf — Claude fragt nach, statt dass du es wieder erklärst.',
    satz: 'Mir zwickt etwas — lass uns überlegen, was das für die nächsten Einheiten '
      + 'heißt.',
  },
  {
    titel: 'Lass dir deine Zahlen erklären',
    text: 'HRV, Body Battery, Bereitschaft: Statt der nackten Kurve die Einordnung, '
      + 'was davon in deiner Trainingsphase überhaupt eine Aussage ist.',
    satz: 'Erklär mir, was meine Körperdaten der letzten zwei Wochen aussagen.',
  },
  {
    titel: 'Halte die Grundlagen aktuell',
    text: 'Ziel, Form, Paces, Phase — was länger gilt, steht in den Grundlagen deines '
      + 'Trainingsbuchs. Ändert sich etwas, sag es einmal und es gilt für jeden '
      + 'weiteren Chat.',
    satz: 'Meine Grundlagen stimmen nicht mehr ganz — lass uns die durchgehen.',
  },
]

/**
 * Welcher Hinweis heute dran ist.
 *
 * Aus dem **Datum** und nicht zufällig: Ein Zufallswert wechselte bei jedem Neuladen,
 * und ein Athlet, der die Seite zweimal öffnet, hielte den ersten Hinweis für einen
 * Fehler. Über den Tag gerechnet ist er stabil, server- wie clientseitig identisch
 * (kein Hydrations-Bruch) — und morgen ein anderer.
 *
 * Gezählt werden **echte Tage seit der Epoche**, nicht die Ziffern von `YYYYMMDD`.
 * Der naheliegende Weg — die Zahl 20260831 einfach modulo nehmen — springt am
 * Monatswechsel um 70 statt um 1, und bei sieben Einträgen ist 70 durch 7 teilbar:
 * Der 31.08. und der 01.09. zeigten denselben Hinweis. Genau an dem Tag, an dem der
 * Wechsel am ehesten auffällt, bliebe er aus.
 *
 * `Date.UTC` und nicht die lokale Zeitzone: Das Datum kommt bereits als Berliner Tag
 * herein (`heuteInBerlin`), und es hier ein zweites Mal in eine Zeitzone zu übersetzen
 * verschöbe den Wechsel um Stunden.
 */
const MS_PRO_TAG = 86_400_000

export function hinweisDesTages(datum: string): ChatHinweis {
  const [jahr, monat, tag] = datum.split('-').map(t => Number.parseInt(t, 10))
  const zeit = Date.UTC(jahr!, (monat ?? 1) - 1, tag ?? 1)

  if (Number.isNaN(zeit)) return CHAT_HINWEISE[0]!

  const tageSeitEpoche = Math.floor(zeit / MS_PRO_TAG)
  // Vor 1970 wäre der Rest negativ; das kann hier nicht vorkommen, aber ein negativer
  // Index träfe `undefined` und die Seite bliebe ohne Hinweis stehen.
  const index = ((tageSeitEpoche % CHAT_HINWEISE.length) + CHAT_HINWEISE.length)
    % CHAT_HINWEISE.length

  return CHAT_HINWEISE[index]!
}
