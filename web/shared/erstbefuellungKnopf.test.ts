import { describe, expect, it } from 'vitest'
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'
import { erstbefuellungKnopfAnsicht } from './erstbefuellungKnopf'

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

describe('erstbefuellungKnopfAnsicht', () => {
  it('meldet vollständige Daten auch ohne je gelaufene Erstbefüllung', () => {
    // Der Fehler, um den es ging: Ein vom Cron gefülltes Archiv hat keinen Lauf, und
    // der Knopf behauptete darüber „noch nicht geholt" — mit einem Klick, der nichts tat.
    const ansicht = erstbefuellungKnopfAnsicht({ lauf: null, offen: 0 })

    expect(ansicht.meldung).toBe('Deine Körperdaten der letzten 30 Tage liegen vollständig vor.')
    expect(ansicht.knopfAktiv).toBe(false)
  })

  it('sperrt den Knopf auch nach einem Lauf, wenn nichts mehr offen ist', () => {
    expect(erstbefuellungKnopfAnsicht({ lauf: lauf(), offen: 0 }).knopfAktiv).toBe(false)
  })

  it('bietet das Holen an, solange Tage fehlen', () => {
    const ansicht = erstbefuellungKnopfAnsicht({ lauf: null, offen: 30 })

    expect(ansicht.meldung).toContain('noch nicht geholt worden')
    expect(ansicht.meldung).toContain('30 Tage fehlen')
    expect(ansicht.knopfAktiv).toBe(true)
  })

  it('zählt den einzelnen fehlenden Tag im Singular', () => {
    expect(erstbefuellungKnopfAnsicht({ lauf: null, offen: 1 }).meldung).toContain('1 Tag fehlt')
  })

  it('sperrt den Knopf während eines Laufs, egal was im Archiv steht', () => {
    const ansicht = erstbefuellungKnopfAnsicht({ lauf: lauf({ status: 'laeuft' }), offen: 12 })

    expect(ansicht.meldung).toContain('werden gerade geholt')
    expect(ansicht.knopfAktiv).toBe(false)
  })

  it('nennt den Fehlschlag beim Namen', () => {
    const ansicht = erstbefuellungKnopfAnsicht({
      lauf: lauf({ status: 'gescheitert', geschrieben: 0, gescheitert: 30 }),
      offen: 30,
    })

    expect(ansicht.meldung).toContain('gescheitert')
    expect(ansicht.knopfAktiv).toBe(true)
  })

  it('sagt bei einem teilweise geglückten Lauf, dass noch etwas fehlt', () => {
    // Sonst sähe „20 Tage geholt" aus wie ein vollständiger Lauf, und niemand drückte
    // ein zweites Mal.
    const ansicht = erstbefuellungKnopfAnsicht({
      lauf: lauf({ geschrieben: 20, gescheitert: 10 }),
      offen: 10,
    })

    expect(ansicht.meldung).toBe('20 Tage Körperdaten geholt. 10 Tage fehlen noch. Ein zweiter Versuch holt sie nach.')
    expect(ansicht.knopfAktiv).toBe(true)
  })

  it('lässt den Knopf anklickbar, wenn das Archiv nicht lesbar war', () => {
    const ansicht = erstbefuellungKnopfAnsicht({ lauf: null, offen: null })

    expect(ansicht.meldung).toBe('Deine Körperdaten der letzten 30 Tage sind noch nicht geholt worden.')
    expect(ansicht.knopfAktiv).toBe(true)
  })
})
