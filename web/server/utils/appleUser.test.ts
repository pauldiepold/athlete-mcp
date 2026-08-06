import { describe, it, expect } from 'vitest'
import { appleAnzeigename } from './appleUser'

describe('appleAnzeigename', () => {
  it('liest den Namen aus dem JSON-String, den Apple schickt', () => {
    const feld = '{"name":{"firstName":"Paul","lastName":"Diepold"},"email":"p@example.com"}'

    expect(appleAnzeigename(feld)).toBe('Paul Diepold')
  })

  it('nimmt auch ein bereits geparstes Objekt an', () => {
    expect(appleAnzeigename({ name: { firstName: 'Paul', lastName: 'Diepold' } })).toBe(
      'Paul Diepold',
    )
  })

  it('kommt mit nur einem der beiden Namensteile aus', () => {
    expect(appleAnzeigename('{"name":{"firstName":"Paul"}}')).toBe('Paul')
    expect(appleAnzeigename('{"name":{"lastName":"Diepold"}}')).toBe('Diepold')
  })

  it('liefert leer, wenn Apple nichts schickt — der Normalfall ab dem zweiten Login', () => {
    expect(appleAnzeigename(undefined)).toBe('')
    expect(appleAnzeigename(null)).toBe('')
    expect(appleAnzeigename('')).toBe('')
  })

  it('kippt bei kaputtem oder unerwartetem JSON nicht, sondern liefert leer', () => {
    expect(appleAnzeigename('{kein json')).toBe('')
    expect(appleAnzeigename('"nur ein string"')).toBe('')
    expect(appleAnzeigename('{"name":"Paul"}')).toBe('')
    expect(appleAnzeigename('{"name":{"firstName":42}}')).toBe('')
    expect(appleAnzeigename('{"name":{"firstName":"  "}}')).toBe('')
  })
})
