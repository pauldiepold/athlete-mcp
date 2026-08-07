import { describe, expect, it } from 'vitest'
import {
  einrichtungsSchritte,
  naechsterOffenerSchritt,
  offenePflichtSchritte,
  pflichtOffen,
  type EinrichtungsEingaben,
} from './einrichtung'

function eingaben(felder: Partial<EinrichtungsEingaben> = {}): EinrichtungsEingaben {
  return {
    garmin: 'fehlt',
    finalsurge: 'fehlt',
    connector: false,
    steuerungsplan: false,
    ...felder,
  }
}

describe('einrichtungsSchritte', () => {
  it('steht in der empfohlenen Reihenfolge, Garmin zuerst', () => {
    // Garmin zuerst, weil seine Erstbefüllung im Hintergrund weiterläuft, während der
    // Athlet die übrigen Schritte macht.
    expect(einrichtungsSchritte(eingaben()).map(s => s.id)).toEqual([
      'garmin',
      'finalsurge',
      'connector',
      'onboarding',
    ])
  })

  it('kennt die beiden Verbindungen als überspringbar und die anderen als Pflicht', () => {
    const optional = Object.fromEntries(
      einrichtungsSchritte(eingaben()).map(s => [s.id, s.optional]),
    )
    expect(optional).toEqual({
      garmin: true,
      finalsurge: true,
      connector: false,
      onboarding: false,
    })
  })

  it('leitet die Verbindungen aus ihrem Zustand ab', () => {
    const schritte = einrichtungsSchritte(
      eingaben({ garmin: 'verbunden', finalsurge: 'fehlt' }),
    )
    expect(schritte.find(s => s.id === 'garmin')?.erledigt).toBe(true)
    expect(schritte.find(s => s.id === 'finalsurge')?.erledigt).toBe(false)
  })

  it('hält eine kaputte Verbindung nicht für erledigt', () => {
    // „Eingerichtet, aber der letzte Aufruf ist gescheitert" ist kein Haken: Von dort
    // kommen keine Daten, und der Schritt ist derselbe wie beim ersten Mal.
    const schritte = einrichtungsSchritte(eingaben({ garmin: 'kaputt' }))
    expect(schritte.find(s => s.id === 'garmin')?.erledigt).toBe(false)
  })

  it('hakt den Connector ab, sobald ein Grant existiert', () => {
    const schritte = einrichtungsSchritte(eingaben({ connector: true }))
    expect(schritte.find(s => s.id === 'connector')?.erledigt).toBe(true)
  })

  it('hakt das Onboarding am vorhandenen Steuerungsplan ab', () => {
    // Es gibt kein Flag daneben: Ein zweiter Wahrheitsort mit demselben Zweck wäre
    // falsch, sobald jemand seinen Plan löscht.
    const schritte = einrichtungsSchritte(eingaben({ steuerungsplan: true }))
    expect(schritte.find(s => s.id === 'onboarding')?.erledigt).toBe(true)
  })
})

describe('pflichtOffen', () => {
  it('ist offen, solange Connector oder Onboarding fehlen', () => {
    expect(pflichtOffen(einrichtungsSchritte(eingaben()))).toBe(true)
    expect(pflichtOffen(einrichtungsSchritte(eingaben({ connector: true })))).toBe(true)
    expect(pflichtOffen(einrichtungsSchritte(eingaben({ steuerungsplan: true })))).toBe(
      true,
    )
  })

  it('ist erledigt, obwohl beide Verbindungen fehlen', () => {
    // Der Kern des Überspringens: Wer keinen Coach-Plan und keine Uhr hat, bleibt
    // sonst dauerhaft in einer unfertigen Liste hängen.
    expect(
      pflichtOffen(einrichtungsSchritte(eingaben({ connector: true, steuerungsplan: true }))),
    ).toBe(false)
  })

  it('bleibt erledigt, wenn eine überspringbare Verbindung kaputt geht', () => {
    // Auf eine kaputte Verbindung weist der Verbindungs-Hinweis hin — sie holt die
    // Einrichtung nicht zurück auf die Startseite.
    expect(
      pflichtOffen(
        einrichtungsSchritte(
          eingaben({ garmin: 'kaputt', connector: true, steuerungsplan: true }),
        ),
      ),
    ).toBe(false)
  })
})

describe('offenePflichtSchritte', () => {
  it('zählt nur die Pflichtschritte', () => {
    // Die überspringbaren Verbindungen fehlen hier beide — gezählt wird trotzdem nur,
    // was die Einrichtung wirklich offen hält.
    expect(offenePflichtSchritte(einrichtungsSchritte(eingaben()))).toBe(2)
  })

  it('zählt herunter, sobald ein Pflichtschritt steht', () => {
    expect(offenePflichtSchritte(einrichtungsSchritte(eingaben({ connector: true })))).toBe(1)
  })

  it('ist null, wenn alle Pflichtschritte stehen', () => {
    expect(
      offenePflichtSchritte(
        einrichtungsSchritte(eingaben({ connector: true, steuerungsplan: true })),
      ),
    ).toBe(0)
  })
})

describe('naechsterOffenerSchritt', () => {
  it('nennt den ersten offenen Pflichtschritt in der Reihenfolge', () => {
    expect(naechsterOffenerSchritt(einrichtungsSchritte(eingaben()))).toBe('connector')
  })

  it('überspringt einen erledigten Pflichtschritt', () => {
    expect(
      naechsterOffenerSchritt(einrichtungsSchritte(eingaben({ connector: true }))),
    ).toBe('onboarding')
  })

  it('bleibt an keiner übersprungenen Verbindung hängen', () => {
    // Garmin steht in der Liste vorn und darf dauerhaft offen bleiben. Stünde es hier,
    // klappte auf der Startseite für immer der Schritt auf, den der Athlet bewusst
    // ausgelassen hat — statt dessen, der ihn noch aufhält.
    expect(
      naechsterOffenerSchritt(
        einrichtungsSchritte(eingaben({ garmin: 'fehlt', connector: true })),
      ),
    ).toBe('onboarding')
  })

  it('nennt nichts, wenn alle Pflichtschritte stehen', () => {
    expect(
      naechsterOffenerSchritt(
        einrichtungsSchritte(eingaben({ connector: true, steuerungsplan: true })),
      ),
    ).toBeNull()
  })
})
