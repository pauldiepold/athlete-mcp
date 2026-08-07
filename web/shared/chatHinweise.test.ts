import { describe, expect, it } from 'vitest'
import { CHAT_HINWEISE, hinweisDesTages } from './chatHinweise'

describe('hinweisDesTages', () => {
  it('liefert am selben Tag denselben Hinweis', () => {
    // Der Punkt gegenüber einem Zufallswert: Zweimal Neuladen darf den Hinweis nicht
    // wechseln, sonst liest sich die Startseite wie ein Karussell.
    expect(hinweisDesTages('2026-08-07')).toBe(hinweisDesTages('2026-08-07'))
  })

  it('wechselt von einem Tag auf den nächsten', () => {
    expect(hinweisDesTages('2026-08-07')).not.toBe(hinweisDesTages('2026-08-08'))
  })

  it('wechselt auch über Monats- und Jahresgrenzen', () => {
    // Der Fehler, den die Ziffern-Variante hatte: `20260831 % 7` und `20260901 % 7`
    // sind gleich — ausgerechnet am Monatsersten bliebe der Hinweis stehen.
    expect(hinweisDesTages('2026-08-31')).not.toBe(hinweisDesTages('2026-09-01'))
    expect(hinweisDesTages('2026-12-31')).not.toBe(hinweisDesTages('2027-01-01'))
  })

  it('zählt über einen Monatswechsel hinweg lückenlos weiter', () => {
    // Sieben aufeinanderfolgende Tage quer über den Monatswechsel müssen alle sieben
    // Hinweise treffen — sonst fällt einer aus der Rotation.
    const tage = [
      '2026-08-29', '2026-08-30', '2026-08-31',
      '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
    ]

    expect(new Set(tage.map(hinweisDesTages)).size).toBe(CHAT_HINWEISE.length)
  })

  it('liefert über eine volle Runde jeden Hinweis der Liste', () => {
    const gesehen = new Set(
      Array.from({ length: CHAT_HINWEISE.length }, (_, i) =>
        hinweisDesTages(`2026-08-${String(i + 1).padStart(2, '0')}`)),
    )

    expect(gesehen.size).toBe(CHAT_HINWEISE.length)
  })

  it('fällt bei unbrauchbarem Datum auf den ersten Hinweis zurück', () => {
    // Kein Fehler nach oben: Der Hinweis ist Beiwerk, und eine kaputte Startseite
    // wegen eines Datums wäre der teurere Ausgang.
    expect(hinweisDesTages('kein-datum')).toBe(CHAT_HINWEISE[0])
  })

  it('gibt jedem Hinweis einen kopierbaren Satz', () => {
    // Der Satz ist der Zweck des Blocks — ein Hinweis ohne ihn beschriebe nur.
    expect(CHAT_HINWEISE.every(h => h.satz.trim().length > 0)).toBe(true)
  })
})
