import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  nimmAuthStateCookie,
  putAuthState,
  setzeAuthStateCookie,
  sichererZielpfad,
  takeAuthState,
} from './authState'

/**
 * Diese Tests halten die Naht fest, an der der Login zuletzt gebrochen ist: Was auf dem
 * Hinweg abgelegt wird, muss der Callback wiederfinden. Die Regression durch
 * `nuxt-auth-utils` 0.5.30 (die Bibliothek erzeugt ihren `state` selbst und ignoriert
 * den durchgereichten) lief durch die gesamte Suite, weil niemand diesen Zusammenhang
 * geprüft hat.
 */

function ereignis(cookieHeader?: string) {
  const req = new IncomingMessage(new Socket())
  if (cookieHeader) {
    req.headers.cookie = cookieHeader
  }
  const res = new ServerResponse(req)
  return { event: createEvent(req, res), res }
}

function gesetzteCookies(res: ServerResponse): string[] {
  const roh = res.getHeader('set-cookie')
  return Array.isArray(roh) ? roh : roh ? [String(roh)] : []
}

function speicher(inhalt: Record<string, string> = {}) {
  const daten = new Map(Object.entries(inhalt))
  return {
    daten,
    kv: {
      get: async (key: string) => daten.get(key) ?? null,
      put: async (key: string, value: string) => void daten.set(key, value),
      delete: async (key: string) => void daten.delete(key),
    } as unknown as KVNamespace,
  }
}

describe('sichererZielpfad', () => {
  it('lässt lokale Pfade durch', () => {
    expect(sichererZielpfad('/trainingsbuch')).toBe('/trainingsbuch')
  })

  it('weist alles ab, was auf einen fremden Host zeigt', () => {
    expect(sichererZielpfad('https://example.com')).toBe('/')
    expect(sichererZielpfad('//example.com')).toBe('/')
    expect(sichererZielpfad('/\\example.com')).toBe('/')
    expect(sichererZielpfad(undefined)).toBe('/')
  })
})

describe('Nutzlast über den Provider-Hop', () => {
  it('findet im Callback wieder, was der Hinweg abgelegt hat', async () => {
    const { kv } = speicher()
    const hin = ereignis()

    const handle = await putAuthState(kv, { redirectTo: '/trainingsbuch' })
    setzeAuthStateCookie(hin.event, handle, 'lax')

    // Der Browser schickt genau das Cookie zurück, das der Hinweg gesetzt hat.
    const cookie = gesetzteCookies(hin.res)[0]!
    const rueck = ereignis(cookie.split(';')[0])

    const zustand = await takeAuthState(kv, nimmAuthStateCookie(rueck.event))

    expect(zustand).toEqual({ redirectTo: '/trainingsbuch' })
  })

  it('gilt nur einmal — der zweite Callback findet nichts mehr', async () => {
    const { kv } = speicher()
    const handle = await putAuthState(kv, { redirectTo: '/' })

    expect(await takeAuthState(kv, handle)).toEqual({ redirectTo: '/' })
    expect(await takeAuthState(kv, handle)).toBeNull()
  })

  it('weist ein erfundenes Handle ab, ohne etwas zu liefern', async () => {
    const { kv } = speicher()

    expect(await takeAuthState(kv, 'ausgedacht')).toBeNull()
    expect(await takeAuthState(kv, undefined)).toBeNull()
    expect(await takeAuthState(kv, '')).toBeNull()
  })

  it('wäscht ein manipuliertes Ziel aus dem KV noch beim Einlösen', async () => {
    const { kv, daten } = speicher()
    const handle = await putAuthState(kv, { redirectTo: '/' })
    daten.set(`authstate:${handle}`, JSON.stringify({ redirectTo: 'https://example.com' }))

    expect(await takeAuthState(kv, handle)).toEqual({ redirectTo: '/' })
  })
})

describe('Das Handle-Cookie', () => {
  it('geht für Apple als SameSite=None; Secure raus — sonst überlebt es den form_post nicht', () => {
    const { event, res } = ereignis()

    setzeAuthStateCookie(event, 'abc', 'none')

    const cookie = gesetzteCookies(res)[0]!
    expect(cookie).toMatch(/SameSite=None/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/HttpOnly/i)
  })

  it('bleibt für Google bei SameSite=Lax', () => {
    const { event, res } = ereignis()

    setzeAuthStateCookie(event, 'abc', 'lax')

    expect(gesetzteCookies(res)[0]!).toMatch(/SameSite=Lax/i)
  })

  it('räumt sich beim Lesen ab, damit kein Rest am nächsten Versuch klebt', () => {
    const { event, res } = ereignis('athlete-auth-state=abc')

    expect(nimmAuthStateCookie(event)).toBe('abc')
    expect(gesetzteCookies(res)[0]).toMatch(/athlete-auth-state=;/)
  })
})
