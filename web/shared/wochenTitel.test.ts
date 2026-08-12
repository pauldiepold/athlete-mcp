import { describe, expect, it } from 'vitest'
import { kwKurz, wochenTitel, zeitraumText } from './wochenTitel'

describe('zeitraumText', () => {
  it('nennt den Monat einmal, wenn die Woche in einem Monat liegt', () => {
    expect(zeitraumText('2026-W34')).toBe('17.–23. August')
  })

  it('nennt beide Monate über die Monatsgrenze', () => {
    // 31. August bis 6. September — der Fall, in dem „31.–6. September" falsch wäre.
    expect(zeitraumText('2026-W36')).toBe('31. August – 6. September')
  })

  it('rechnet über die Jahresgrenze mit dem Wochen-Jahr', () => {
    // ISO-Woche 1 von 2026 beginnt noch im Dezember 2025.
    expect(zeitraumText('2026-W01')).toBe('29. Dezember – 4. Januar')
  })
})

describe('kwKurz', () => {
  it('lässt das Jahr weg', () => {
    expect(kwKurz('2026-W07')).toBe('KW 07')
  })
})

describe('wochenTitel', () => {
  it('setzt Nummer und Zeitraum zusammen', () => {
    expect(wochenTitel('2026-W34')).toBe('KW 34 · 17.–23. August')
  })
})
