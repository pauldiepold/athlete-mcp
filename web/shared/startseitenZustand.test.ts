import { describe, expect, it } from 'vitest'
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'
import {
  ABFRAGE_INTERVALL_LAEUFT_MS,
  ABFRAGE_INTERVALL_WARTEND_MS,
  abfrageIntervallMs,
  startseitenZustand,
  zeigtVerlaeufe,
  type StartseitenEingaben,
} from './startseitenZustand'

function lauf(felder: Partial<ErstbefuellungLauf> = {}): ErstbefuellungLauf {
  return {
    status: 'fertig',
    begonnen: '2026-08-06T05:00:00.000Z',
    offen: 30,
    geschrieben: 30,
    gescheitert: 0,
    ...felder,
  }
}

/**
 * Der Normalfall der bestehenden Fälle: Die Einrichtung ist durch. Ohne diesen
 * Default stünde sie in jedem Test der drei Körperdaten-Zustände im Weg.
 */
function eingaben(felder: Partial<StartseitenEingaben>): StartseitenEingaben {
  return {
    einrichtungOffen: false,
    garminVerbunden: false,
    hatKoerperdaten: false,
    lauf: null,
    ...felder,
  }
}

describe('startseitenZustand', () => {
  it('zeigt die Verläufe, sobald Körperdaten da sind', () => {
    expect(
      startseitenZustand(eingaben({ garminVerbunden: true, hatKoerperdaten: true, lauf: lauf() })),
    ).toBe('daten')
  })

  it('zeigt die Einrichtung, solange ein Pflichtschritt offen ist', () => {
    expect(startseitenZustand(eingaben({ einrichtungOffen: true }))).toBe('einrichtung')
  })

  it('zeigt die Einrichtung auch vor fertigen Körperdaten', () => {
    // Erst wenn alle Pflichtschritte stehen **und** Daten da sind, tritt das Dashboard
    // an ihre Stelle. Ein halb eingerichtetes Konto hat Wichtigeres zu tun, als
    // Verläufe anzusehen.
    expect(
      startseitenZustand(eingaben({
        einrichtungOffen: true,
        garminVerbunden: true,
        hatKoerperdaten: true,
        lauf: lauf(),
      })),
    ).toBe('einrichtung')
  })

  it('zeigt die Einrichtung auch während der Erstbefüllung', () => {
    // Der Lauf läuft im Hintergrund weiter — er ist genau der Grund, warum Garmin der
    // erste Schritt ist. Ihn hier vorzuziehen, ließe den Athleten einem Ladebalken
    // zusehen, statt seinen Connector einzurichten.
    expect(
      startseitenZustand(eingaben({
        einrichtungOffen: true,
        garminVerbunden: true,
        lauf: lauf({ status: 'laeuft' }),
      })),
    ).toBe('einrichtung')
  })

  it('zeigt die Verläufe auch, wenn die Verbindung inzwischen weg ist', () => {
    // Ein Archiv aus der Zeit vor dem Bruch ist kein leeres Dashboard: Was da ist,
    // bleibt lesbar — auf das Fehlende weist der Verbindungs-Hinweis hin.
    expect(
      startseitenZustand(eingaben({ hatKoerperdaten: true })),
    ).toBe('daten')
  })

  it('schickt ein Konto ohne Verbindung zu den Einstellungen', () => {
    // Die Einrichtung ist durch, Garmin wurde übersprungen — dann bleibt der
    // Verbindungs-Hinweis, nicht die Liste, die der Athlet abgeschlossen hat.
    expect(startseitenZustand(eingaben({}))).toBe('nicht-verbunden')
  })

  it('bietet das Nachladen an, wenn verbunden ist und nichts läuft', () => {
    expect(
      startseitenZustand(eingaben({ garminVerbunden: true })),
    ).toBe('keine-daten')
  })

  it('bietet das Nachladen auch nach einem gescheiterten Lauf an', () => {
    expect(
      startseitenZustand(eingaben({
        garminVerbunden: true,
        lauf: lauf({ status: 'gescheitert', geschrieben: 0 }),
      })),
    ).toBe('keine-daten')
  })

  it('nennt den laufenden Lauf, solange er läuft', () => {
    expect(
      startseitenZustand(eingaben({
        garminVerbunden: true,
        lauf: lauf({ status: 'laeuft' }),
      })),
    ).toBe('laeuft')
  })

  it('bleibt beim laufenden Lauf, auch wenn schon Tage da sind', () => {
    // Der Vorrang entscheidet den Knopf: Während des Laufs darf keiner erscheinen,
    // sonst drückt der Athlet mitten in einen laufenden Abruf hinein.
    expect(
      startseitenZustand(eingaben({
        garminVerbunden: true,
        hatKoerperdaten: true,
        lauf: lauf({ status: 'laeuft' }),
      })),
    ).toBe('laeuft')
  })
})

describe('zeigtVerlaeufe', () => {
  it('hängt an den Daten, nicht am Zustand', () => {
    expect(zeigtVerlaeufe('daten', true)).toBe(true)
    expect(zeigtVerlaeufe('laeuft', true)).toBe(true)
    expect(zeigtVerlaeufe('laeuft', false)).toBe(false)
    expect(zeigtVerlaeufe('keine-daten', false)).toBe(false)
    expect(zeigtVerlaeufe('nicht-verbunden', false)).toBe(false)
  })

  it('zeigt während der Einrichtung keine Verläufe, auch mit Daten', () => {
    // Die Einrichtung tritt an die Stelle des Dashboards, sie steht nicht darüber.
    expect(zeigtVerlaeufe('einrichtung', true)).toBe(false)
  })
})

describe('abfrageIntervallMs', () => {
  it('fragt während des Laufs eng nach', () => {
    expect(abfrageIntervallMs('laeuft')).toBe(ABFRAGE_INTERVALL_LAEUFT_MS)
  })

  it('fragt in den wartenden Zuständen ruhiger nach', () => {
    expect(abfrageIntervallMs('nicht-verbunden')).toBe(ABFRAGE_INTERVALL_WARTEND_MS)
    expect(abfrageIntervallMs('keine-daten')).toBe(ABFRAGE_INTERVALL_WARTEND_MS)
    // Auch die Einrichtung: Ihre beiden Pflichtschritte werden **außerhalb** dieser
    // Fläche erledigt — im Connector-Dialog und im Chat. Ohne Nachfragen bliebe der
    // Athlet vor einer Liste sitzen, die er gerade abgearbeitet hat.
    expect(abfrageIntervallMs('einrichtung')).toBe(ABFRAGE_INTERVALL_WARTEND_MS)
  })

  it('hört auf zu fragen, sobald die Daten da sind', () => {
    expect(abfrageIntervallMs('daten')).toBeNull()
  })
})
