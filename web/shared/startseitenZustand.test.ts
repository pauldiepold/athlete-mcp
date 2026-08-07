import { describe, expect, it } from 'vitest'
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'
import {
  ABFRAGE_INTERVALL_LAEUFT_MS,
  ABFRAGE_INTERVALL_WARTEND_MS,
  abfrageIntervallMs,
  startseitenZustand,
  zeigtKoerperdaten,
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

function eingaben(felder: Partial<StartseitenEingaben>): StartseitenEingaben {
  return {
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

  it('zeigt die Verläufe auch, wenn die Verbindung inzwischen weg ist', () => {
    // Ein Archiv aus der Zeit vor dem Bruch ist kein leeres Dashboard: Was da ist,
    // bleibt lesbar — auf das Fehlende weist der Verbindungs-Hinweis hin.
    expect(
      startseitenZustand(eingaben({ hatKoerperdaten: true })),
    ).toBe('daten')
  })

  it('schickt ein Konto ohne Verbindung zu den Einstellungen', () => {
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

describe('zeigtKoerperdaten', () => {
  it('hängt an den Daten, nicht am Zustand', () => {
    expect(zeigtKoerperdaten('daten', true)).toBe(true)
    expect(zeigtKoerperdaten('laeuft', true)).toBe(true)
    expect(zeigtKoerperdaten('laeuft', false)).toBe(false)
    expect(zeigtKoerperdaten('keine-daten', false)).toBe(false)
    expect(zeigtKoerperdaten('nicht-verbunden', false)).toBe(false)
  })

})

describe('abfrageIntervallMs', () => {
  it('fragt während des Laufs eng nach', () => {
    expect(abfrageIntervallMs('laeuft', false)).toBe(ABFRAGE_INTERVALL_LAEUFT_MS)
  })

  it('fragt in den wartenden Zuständen ruhiger nach', () => {
    expect(abfrageIntervallMs('nicht-verbunden', false)).toBe(ABFRAGE_INTERVALL_WARTEND_MS)
    expect(abfrageIntervallMs('keine-daten', false)).toBe(ABFRAGE_INTERVALL_WARTEND_MS)
  })

  it('hört auf zu fragen, sobald die Daten da sind', () => {
    expect(abfrageIntervallMs('daten', false)).toBeNull()
  })

  it('fragt bei offener Einrichtung weiter, auch wenn die Daten da sind', () => {
    // Die offene Einrichtung ist der zweite Grund nachzufragen: Ihre Pflichtschritte
    // werden **außerhalb** dieser Fläche erledigt — im Connector-Dialog und im Chat.
    // Ohne das bliebe der Athlet mit Körperdaten vor einer Liste sitzen, die er gerade
    // abgearbeitet hat.
    expect(abfrageIntervallMs('daten', true)).toBe(ABFRAGE_INTERVALL_WARTEND_MS)
  })

  it('behält den engen Takt des Laufs auch bei offener Einrichtung', () => {
    expect(abfrageIntervallMs('laeuft', true)).toBe(ABFRAGE_INTERVALL_LAEUFT_MS)
  })
})
