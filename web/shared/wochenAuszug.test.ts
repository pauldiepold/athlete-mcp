import { describe, expect, it } from 'vitest'
import { wochenAuszug } from './wochenAuszug'

describe('wochenAuszug', () => {
  it('nimmt die erste nicht-leere Zeile ohne Überschriftenzeichen', () => {
    expect(wochenAuszug('\n\n## Aufbauwoche\n\nMi: 5×1000\n')).toBe('Aufbauwoche')
  })

  it('nimmt auch Fließtext, wenn keine Überschrift da ist', () => {
    expect(wochenAuszug('Ruhige Woche nach dem Wettkampf.')).toBe(
      'Ruhige Woche nach dem Wettkampf.',
    )
  })

  it('liefert für einen leeren Eintrag eine leere Zeichenkette', () => {
    // Der Normalfall einer noch nicht angelegten Woche — kein Fehler.
    expect(wochenAuszug('')).toBe('')
    expect(wochenAuszug('\n   \n')).toBe('')
  })

  it('kürzt lange Zeilen mit Auslassungszeichen', () => {
    const auszug = wochenAuszug('x'.repeat(200))
    expect(auszug).toHaveLength(140)
    expect(auszug.endsWith('…')).toBe(true)
  })
})
