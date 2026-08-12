import { describe, expect, it } from 'vitest'
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'
import { erstbefuellungsFall, knopfAktiv, taktIntervall } from './erstbefuellung'
import {
  ABFRAGE_INTERVALL_LAEUFT_MS as LAEUFT,
  ABFRAGE_INTERVALL_WARTEND_MS as WARTEND,
} from './startseitenZustand'

function lauf(felder: Partial<ErstbefuellungLauf> = {}): ErstbefuellungLauf {
  return {
    status: 'fertig',
    begonnen: '2026-08-06T05:00:00.000Z',
    beendet: '2026-08-06T05:01:00.000Z',
    offen: 30,
    geschrieben: 30,
    gescheitert: 0,
    ...felder,
  }
}

describe('erstbefuellungsFall', () => {
  it('meldet ein vollständiges Fenster auch ohne je gelaufene Erstbefüllung', () => {
    // Der Fehler, um den es ging: Ein vom Cron gefülltes Archiv hat keinen Lauf, und
    // der Knopf behauptete darüber „noch nicht geholt" — mit einem Klick, der nichts tat.
    expect(erstbefuellungsFall({ lauf: null, offen: 0 })).toBe('vollstaendig')
  })

  it('lässt das vollständige Fenster jeden abgeschlossenen Lauf schlagen', () => {
    // Woher die Tage kamen, ist für den Athleten dieselbe Aussage — auch nach einem
    // gescheiterten oder leer gebliebenen Lauf.
    expect(erstbefuellungsFall({ lauf: lauf(), offen: 0 })).toBe('vollstaendig')
    expect(erstbefuellungsFall({ lauf: lauf({ status: 'gescheitert' }), offen: 0 }))
      .toBe('vollstaendig')
    expect(erstbefuellungsFall({ lauf: lauf({ geschrieben: 0 }), offen: 0 }))
      .toBe('vollstaendig')
  })

  it('lässt den laufenden Lauf alles schlagen, auch das vollständige Fenster', () => {
    // Der Vorrang ist der Sinn der Sache: An ihm hängt, dass kein zweiter Klick in ein
    // rate-limitiertes Garmin fährt.
    expect(erstbefuellungsFall({ lauf: lauf({ status: 'laeuft' }), offen: 0 })).toBe('laeuft')
    expect(erstbefuellungsFall({ lauf: lauf({ status: 'laeuft' }), offen: 12 })).toBe('laeuft')
    expect(erstbefuellungsFall({ lauf: lauf({ status: 'laeuft' }), offen: null })).toBe('laeuft')
  })

  it('nennt den nie gelaufenen Abruf so, solange Tage fehlen', () => {
    expect(erstbefuellungsFall({ lauf: null, offen: 30 })).toBe('nie-gelaufen')
    expect(erstbefuellungsFall({ lauf: null, offen: 1 })).toBe('nie-gelaufen')
  })

  it('nennt den Fehlschlag beim Namen', () => {
    expect(
      erstbefuellungsFall({
        lauf: lauf({ status: 'gescheitert', geschrieben: 0, gescheitert: 30 }),
        offen: 30,
      }),
    ).toBe('gescheitert')
  })

  it('unterscheidet den leer gebliebenen Lauf vom gescheiterten', () => {
    // Durchgelaufen und nichts geschrieben ist ein Ergebnis, kein Fehler: Garmin hatte
    // für diese Tage nichts.
    expect(erstbefuellungsFall({ lauf: lauf({ geschrieben: 0 }), offen: 30 }))
      .toBe('leer-geliefert')
  })

  it('nennt den teilweise geglückten Lauf unvollständig', () => {
    // Sonst sähe „20 Tage geholt" aus wie ein vollständiger Lauf, und niemand drückte
    // ein zweites Mal.
    expect(erstbefuellungsFall({ lauf: lauf({ geschrieben: 20, gescheitert: 10 }), offen: 10 }))
      .toBe('unvollstaendig')
  })

  it('entscheidet bei unlesbarem Archiv allein am Lauf', () => {
    // `offen === null` heißt „nicht feststellbar" — es darf weder zu `vollstaendig`
    // führen noch die übrigen Fälle verschieben.
    expect(erstbefuellungsFall({ lauf: null, offen: null })).toBe('nie-gelaufen')
    expect(erstbefuellungsFall({ lauf: lauf({ status: 'gescheitert' }), offen: null }))
      .toBe('gescheitert')
    expect(erstbefuellungsFall({ lauf: lauf({ geschrieben: 0 }), offen: null }))
      .toBe('leer-geliefert')
    expect(erstbefuellungsFall({ lauf: lauf(), offen: null })).toBe('unvollstaendig')
  })
})

describe('knopfAktiv', () => {
  it('sperrt während eines Laufs und bei vollständigem Fenster', () => {
    expect(knopfAktiv('laeuft')).toBe(false)
    expect(knopfAktiv('vollstaendig')).toBe(false)
  })

  it('bietet das Holen in jedem Fall an, in dem etwas fehlt', () => {
    expect(knopfAktiv('nie-gelaufen')).toBe(true)
    expect(knopfAktiv('gescheitert')).toBe(true)
    expect(knopfAktiv('leer-geliefert')).toBe(true)
    expect(knopfAktiv('unvollstaendig')).toBe(true)
  })

  it('sperrt den Knopf nicht, wenn das Archiv nicht lesbar war', () => {
    // Kein toter Knopf für einen Athleten, über dessen Daten wir gerade nichts wissen.
    expect(knopfAktiv(erstbefuellungsFall({ lauf: null, offen: null }))).toBe(true)
    expect(knopfAktiv(erstbefuellungsFall({ lauf: lauf(), offen: null }))).toBe(true)
  })
})

describe('taktIntervall', () => {
  it('macht aus Seiten-Takt und Knopf-Takt genau ein Intervall', () => {
    // Der Fall, um den es geht: Bei offener Einrichtung steht die Einrichtungs-Karte
    // samt Knopf **auf der Startseite** — neben deren eigenem Takt. Während eines Laufs
    // wollen beide nachfragen, und vorher zog jeder dafür sein eigenes `setInterval` auf
    // denselben Abruf auf.
    expect(taktIntervall([LAEUFT, WARTEND])).toBe(LAEUFT)
  })

  it('lässt den engen Takt den weiten schlagen, egal in welcher Reihenfolge', () => {
    // Sonst sähe ein Athlet dem laufenden Abruf zu, während die Zahlen dreißig Sekunden
    // alt stehen bleiben.
    expect(taktIntervall([WARTEND, LAEUFT])).toBe(LAEUFT)
    expect(taktIntervall([LAEUFT, LAEUFT, WARTEND])).toBe(LAEUFT)
  })

  it('überhört ein einzelnes „gar nicht"', () => {
    // Der Knopf will außerhalb eines Laufs nichts wissen — die Startseite fragt in ihren
    // wartenden Zuständen trotzdem weiter, sonst spränge sie nie von selbst weiter.
    expect(taktIntervall([null, WARTEND])).toBe(WARTEND)
    expect(taktIntervall([WARTEND, null])).toBe(WARTEND)
  })

  it('schweigt, wenn alle schweigen', () => {
    // Der eingeschwungene Fall: Daten da, Einrichtung fertig, kein Lauf — hier hört die
    // Seite wirklich auf zu fragen.
    expect(taktIntervall([null, null])).toBeNull()
    expect(taktIntervall([null])).toBeNull()
  })

  it('will ohne Beobachter kein Intervall', () => {
    // Niemand montiert: Der Takt wird abgebaut, statt ins Leere weiterzulaufen.
    expect(taktIntervall([])).toBeNull()
  })

  it('folgt dem verbliebenen Wunsch, wenn ein Beobachter geht', () => {
    // Die Einstellungs-Seite wird verlassen, die Einrichtungs-Karte bleibt: Es muss
    // weiter gefragt werden, sonst hinge der Athlet vor einem stehenden Ladehinweis.
    expect(taktIntervall([LAEUFT])).toBe(LAEUFT)
    expect(taktIntervall([WARTEND])).toBe(WARTEND)
  })
})
