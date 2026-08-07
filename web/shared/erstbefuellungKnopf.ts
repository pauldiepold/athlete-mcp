import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'

/**
 * Was der Erstbefüllungs-Knopf in den Einstellungen sagt und anbietet (Issue #48) —
 * als reine Funktion, weil die Fall-Reihenfolge das Eigentliche daran ist.
 *
 * **Der Lauf allein reicht nicht.** Er stand hier lange als einzige Eingabe, und genau
 * daran ging es kaputt: Wessen Archiv der nächtliche Cron oder ein Backfill gefüllt hat,
 * hat nie einen Lauf gehabt — und las trotzdem „noch nicht geholt worden" über
 * vollständigen Daten. Der Knopf darunter tat dann folgerichtig nichts, denn ohne
 * offene Tage stößt die Route keinen Lauf an. Zweimal dieselbe Ursache: Die Wahrheit
 * über die Daten steht im **Archiv**, nicht im Zustand des letzten Laufs.
 *
 * Der Lauf erklärt weiterhin, *warum* etwas fehlt — er ist die zweite Eingabe, nicht
 * die erste.
 */
export interface ErstbefuellungKnopfEingaben {
  /** Der letzte Lauf, wenn es je einen gab. */
  lauf: ErstbefuellungLauf | null
  /**
   * Wie viele Tage des 30-Tage-Fensters im Archiv fehlen. `null` heißt „nicht
   * feststellbar" (Archiv nicht lesbar) — dann entscheidet allein der Lauf, und der
   * Knopf bleibt anklickbar, statt einen Athleten vor einem toten Knopf zu lassen.
   */
  offen: number | null
}

export interface ErstbefuellungKnopfAnsicht {
  meldung: string
  knopfText: string
  /** Ob es überhaupt etwas zu holen gibt; ein laufender Lauf sperrt zusätzlich. */
  knopfAktiv: boolean
}

export function erstbefuellungKnopfAnsicht({
  lauf,
  offen,
}: ErstbefuellungKnopfEingaben): ErstbefuellungKnopfAnsicht {
  // Der laufende Lauf zuerst, wie auf der Startseite: An ihm hängt, dass kein zweiter
  // Klick in ein rate-limitiertes Garmin fährt.
  if (lauf?.status === 'laeuft') {
    return {
      meldung:
        'Deine Körperdaten der letzten 30 Tage werden gerade geholt — das dauert etwa eine Minute.',
      knopfText: 'Körperdaten holen',
      knopfAktiv: false,
    }
  }

  // Vollständiges Fenster schlägt jeden Lauf: Woher die Tage kamen — Erstbefüllung,
  // Cron oder Backfill —, ist für den Athleten dieselbe Aussage.
  if (offen === 0) {
    return {
      meldung: 'Deine Körperdaten der letzten 30 Tage liegen vollständig vor.',
      knopfText: 'Neu holen',
      // Es gibt nichts zu holen. Ein anklickbarer Knopf verspräche hier eine Wirkung,
      // die die Route gar nicht haben kann — sie überspringt archivierte Tage.
      knopfAktiv: false,
    }
  }

  const fehlt = offen === null ? '' : ` ${offen} ${offen === 1 ? 'Tag fehlt' : 'Tage fehlen'} noch.`

  if (!lauf) {
    return {
      meldung: `Deine Körperdaten der letzten 30 Tage sind noch nicht geholt worden.${fehlt}`,
      knopfText: 'Körperdaten holen',
      knopfAktiv: true,
    }
  }

  if (lauf.status === 'gescheitert') {
    return {
      meldung: 'Der Abruf deiner Körperdaten ist gescheitert. Versuch es gleich noch einmal.',
      knopfText: 'Neu holen',
      knopfAktiv: true,
    }
  }

  // Durchgelaufen, und trotzdem fehlt etwas. Ein teilweise gescheiterter Lauf sähe
  // sonst aus wie ein geglückter: „20 Tage geholt" ohne den Hinweis, dass zehn fehlen,
  // und der Athlet hätte keinen Anlass, den Knopf noch einmal zu drücken.
  const geholt
    = lauf.geschrieben > 0
      ? `${lauf.geschrieben} ${lauf.geschrieben === 1 ? 'Tag' : 'Tage'} Körperdaten geholt.`
      : 'Für diese Tage hat Garmin nichts geliefert.'

  return {
    meldung: `${geholt}${fehlt} Ein zweiter Versuch holt sie nach.`,
    knopfText: 'Neu holen',
    knopfAktiv: true,
  }
}
