import { describe, expect, it } from 'vitest'
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'
import {
  ABFRAGE_INTERVALL_LAEUFT_MS,
  ABFRAGE_INTERVALL_WARTEND_MS,
  abfrageIntervallMs,
  startseitenZustand,
  zeigtVerlaeufe,
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

describe('startseitenZustand', () => {
  it('zeigt die Verläufe, sobald Körperdaten da sind', () => {
    expect(
      startseitenZustand({ garminVerbunden: true, hatKoerperdaten: true, lauf: lauf() }),
    ).toBe('daten')
  })

  it('zeigt die Verläufe auch, wenn die Verbindung inzwischen weg ist', () => {
    // Ein Archiv aus der Zeit vor dem Bruch ist kein leeres Dashboard: Was da ist,
    // bleibt lesbar — auf das Fehlende weist der Verbindungs-Hinweis hin.
    expect(
      startseitenZustand({ garminVerbunden: false, hatKoerperdaten: true, lauf: null }),
    ).toBe('daten')
  })

  it('schickt ein Konto ohne Verbindung zu den Einstellungen', () => {
    expect(
      startseitenZustand({ garminVerbunden: false, hatKoerperdaten: false, lauf: null }),
    ).toBe('nicht-verbunden')
  })

  it('bietet das Nachladen an, wenn verbunden ist und nichts läuft', () => {
    expect(
      startseitenZustand({ garminVerbunden: true, hatKoerperdaten: false, lauf: null }),
    ).toBe('keine-daten')
  })

  it('bietet das Nachladen auch nach einem gescheiterten Lauf an', () => {
    expect(
      startseitenZustand({
        garminVerbunden: true,
        hatKoerperdaten: false,
        lauf: lauf({ status: 'gescheitert', geschrieben: 0 }),
      }),
    ).toBe('keine-daten')
  })

  it('nennt den laufenden Lauf, solange er läuft', () => {
    expect(
      startseitenZustand({
        garminVerbunden: true,
        hatKoerperdaten: false,
        lauf: lauf({ status: 'laeuft' }),
      }),
    ).toBe('laeuft')
  })

  it('bleibt beim laufenden Lauf, auch wenn schon Tage da sind', () => {
    // Der Vorrang entscheidet den Knopf: Während des Laufs darf keiner erscheinen,
    // sonst drückt der Athlet mitten in einen laufenden Abruf hinein.
    expect(
      startseitenZustand({
        garminVerbunden: true,
        hatKoerperdaten: true,
        lauf: lauf({ status: 'laeuft' }),
      }),
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
})

describe('abfrageIntervallMs', () => {
  it('fragt während des Laufs eng nach', () => {
    expect(abfrageIntervallMs('laeuft')).toBe(ABFRAGE_INTERVALL_LAEUFT_MS)
  })

  it('fragt in den wartenden Zuständen ruhiger nach', () => {
    expect(abfrageIntervallMs('nicht-verbunden')).toBe(ABFRAGE_INTERVALL_WARTEND_MS)
    expect(abfrageIntervallMs('keine-daten')).toBe(ABFRAGE_INTERVALL_WARTEND_MS)
  })

  it('hört auf zu fragen, sobald die Daten da sind', () => {
    expect(abfrageIntervallMs('daten')).toBeNull()
  })
})
