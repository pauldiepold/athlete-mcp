import { describe, expect, it, vi } from 'vitest'
import {
  connectorEingerichtet,
  connectorMarkerKey,
  merkeConnector,
  type ConnectorSpeicher,
  type GrantLeser,
} from './connector'

function speicher(inhalt: Record<string, string> = {}) {
  const daten = new Map(Object.entries(inhalt))
  return {
    daten,
    kv: {
      get: async (key: string) => daten.get(key) ?? null,
      put: async (key: string, value: string) => void daten.set(key, value),
    } satisfies ConnectorSpeicher,
  }
}

function grants(anzahl: number): GrantLeser {
  return {
    listUserGrants: vi.fn(async () => ({
      items: Array.from({ length: anzahl }, () => ({})),
    })),
  } as unknown as GrantLeser
}

describe('connectorEingerichtet', () => {
  it('hakt ab, sobald der Marker steht', async () => {
    const { kv } = speicher({ [connectorMarkerKey('paul')]: '2026-08-07T10:00:00.000Z' })

    expect(
      await connectorEingerichtet({ kv, provider: grants(0), userId: 'paul' }),
    ).toBe(true)
  })

  it('hakt auch ohne Marker ab, wenn ein Grant existiert', async () => {
    // Die Bestandskonten haben längst Grants, aber nie einen Marker geschrieben
    // bekommen — mit dem Marker allein stünde ihr Schritt wieder offen.
    const { kv } = speicher()

    expect(
      await connectorEingerichtet({ kv, provider: grants(1), userId: 'paul' }),
    ).toBe(true)
  })

  it('fragt die Grants gar nicht erst, wenn der Marker steht', async () => {
    // Das `list` ist der langsame, *eventually consistent* Weg — er war der Grund für
    // die Verzögerung. Wer den Marker hat, soll ihn nicht mehr brauchen.
    const { kv } = speicher({ [connectorMarkerKey('paul')]: 'egal' })
    const provider = grants(1)

    await connectorEingerichtet({ kv, provider, userId: 'paul' })

    expect(provider.listUserGrants).not.toHaveBeenCalled()
  })

  it('bleibt offen, wenn weder Marker noch Grant da sind', async () => {
    const { kv } = speicher()

    expect(
      await connectorEingerichtet({ kv, provider: grants(0), userId: 'paul' }),
    ).toBe(false)
  })

  it('bleibt ohne Provider-Binding beim Marker', async () => {
    // Der lokale `nuxt dev`-Server: kein Wrapper, keine Grants — der Schritt steht dort
    // offen, und das ist keine Panne.
    const { kv } = speicher()
    expect(await connectorEingerichtet({ kv, provider: undefined, userId: 'paul' }))
      .toBe(false)
  })

  it('trennt die Athleten', async () => {
    const { kv } = speicher({ [connectorMarkerKey('paul')]: 'egal' })

    expect(
      await connectorEingerichtet({ kv, provider: grants(0), userId: 'jonas' }),
    ).toBe(false)
  })
})

describe('merkeConnector', () => {
  it('schreibt einen Marker, den die Abfrage danach sieht', async () => {
    const { kv } = speicher()

    await merkeConnector(kv, 'paul')

    expect(
      await connectorEingerichtet({ kv, provider: grants(0), userId: 'paul' }),
    ).toBe(true)
  })
})
