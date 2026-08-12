import { describe, expect, it } from 'vitest'
import { flaecheFuerPfad, hatAthletNavigation } from './flaechen'

// Die Zuordnung Pfad → Fläche entscheidet, welcher Tab in der unteren Leiste leuchtet.
// Sie ist in keinem Template prüfbar und hat genau die Fälle, die man beim Umbenennen
// einer Route übersieht: die Unterseiten und die Flächen ohne eigenen Tab.
describe('flaecheFuerPfad', () => {
  it('erkennt die Startseite nur exakt', () => {
    expect(flaecheFuerPfad('/')).toBe('start')
  })

  it('ordnet die Tagesansicht den Körperdaten zu', () => {
    expect(flaecheFuerPfad('/dashboard')).toBe('koerperdaten')
    expect(flaecheFuerPfad('/tag/2026-06-24')).toBe('koerperdaten')
  })

  it('ordnet eine einzelne Woche dem Trainingsbuch zu', () => {
    expect(flaecheFuerPfad('/steuerung')).toBe('steuerung')
    expect(flaecheFuerPfad('/steuerung/2026-W25')).toBe('steuerung')
  })

  it('hebt für Einstellungen und Admin keine Fläche hervor', () => {
    expect(flaecheFuerPfad('/einstellungen')).toBeUndefined()
    expect(flaecheFuerPfad('/admin')).toBeUndefined()
  })

  // Ein Präfix-Vergleich ohne Grenze würde hier zuschlagen: `/steuerungsberatung`
  // fängt mit `/steuerung` an, ist aber eine andere Fläche.
  it('greift nur an der Segmentgrenze', () => {
    expect(flaecheFuerPfad('/steuerungsberatung')).toBeUndefined()
    expect(flaecheFuerPfad('/dashboards')).toBeUndefined()
  })
})

describe('hatAthletNavigation', () => {
  it('trägt die Leiste auf den Athleten-Flächen', () => {
    expect(hatAthletNavigation('/')).toBe(true)
    expect(hatAthletNavigation('/dashboard')).toBe(true)
    expect(hatAthletNavigation('/steuerung/2026-W25')).toBe(true)
    expect(hatAthletNavigation('/einstellungen')).toBe(true)
  })

  it('lässt Admin, Consent und Einladung ohne Leiste', () => {
    expect(hatAthletNavigation('/admin')).toBe(false)
    expect(hatAthletNavigation('/authorize')).toBe(false)
    expect(hatAthletNavigation('/invite')).toBe(false)
  })
})
