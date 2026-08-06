import { describe, it, expect } from 'vitest'
import { autorisierungsFehlerUrl } from './autorisierungsAntwort'

const ZIEL = 'https://claude.ai/api/mcp/auth_callback'

describe('autorisierungsFehlerUrl', () => {
  it('hängt Code und Beschreibung an die Redirect-URI des Clients', () => {
    const url = new URL(autorisierungsFehlerUrl(ZIEL, { code: 'access_denied' }))

    expect(url.origin + url.pathname).toBe(ZIEL)
    expect(url.searchParams.get('error')).toBe('access_denied')
    expect(url.searchParams.get('error_description')).toBeNull()
  })

  it('gibt Claudes state unverändert zurück — sonst verwirft der Client die Antwort', () => {
    const url = new URL(
      autorisierungsFehlerUrl(ZIEL, { code: 'access_denied', state: 'a b&c=d' }),
    )

    expect(url.searchParams.get('state')).toBe('a b&c=d')
  })

  it('trägt den Issuer als `iss` ein (RFC 9207)', () => {
    const url = new URL(
      autorisierungsFehlerUrl(ZIEL, {
        code: 'server_error',
        issuer: 'https://dev.training.pauldiepold.de',
      }),
    )

    expect(url.searchParams.get('iss')).toBe('https://dev.training.pauldiepold.de')
  })

  it('lässt eine vorhandene Query der Redirect-URI stehen', () => {
    // Ein registrierter redirect_uri darf eigene Parameter tragen; sie zu überschreiben
    // hieße, den Client an einer Stelle zu reparieren, an der er nicht kaputt ist.
    const url = new URL(
      autorisierungsFehlerUrl(`${ZIEL}?ref=connector`, { code: 'access_denied' }),
    )

    expect(url.searchParams.get('ref')).toBe('connector')
    expect(url.searchParams.get('error')).toBe('access_denied')
  })

  it('lässt leere Felder ganz weg, statt sie leer zu setzen', () => {
    const url = new URL(
      autorisierungsFehlerUrl(ZIEL, {
        code: 'access_denied',
        description: '',
        state: '',
        issuer: '',
      }),
    )

    expect(url.searchParams.get('error_description')).toBeNull()
    expect(url.searchParams.get('state')).toBeNull()
    expect(url.searchParams.get('iss')).toBeNull()
  })
})
