import { describe, expect, it } from 'vitest'
import { fehlerMeldung } from './fehlerMeldung'

/**
 * Der Fall, um den es geht, ist der erste Test: Hinter Cloudflare (HTTP/2) kommt die
 * Reason-Phrase leer an. Genau daran scheiterte die Rückmeldung bei einem falschen
 * Passwort — der leere String ist nicht `undefined`, also griff das `??` der
 * Aufrufstellen nicht und die Fehlerbox blieb leer.
 */

/** Der Fehler, wie ofetch ihn wirft: `data` ist der geparste Antwort-Body. */
function fetchFehler(body: unknown, statusText = '') {
  return { data: body, statusMessage: statusText, status: 400 }
}

describe('fehlerMeldung', () => {
  it('liest die Meldung aus dem Body, wenn die Reason-Phrase leer ist', () => {
    const e = fetchFehler({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Final Surge hat die Anmeldung abgelehnt.',
      data: { meldung: 'Final Surge hat die Anmeldung abgelehnt.' },
    })

    expect(fehlerMeldung(e, 'Fallback')).toBe(
      'Final Surge hat die Anmeldung abgelehnt.',
    )
  })

  // Nicht jede Route benutzt `athletenFehler`; `createError({ statusMessage })` trägt
  // seinen Text unverstümmelt als `message` mit, Umlaute inklusive.
  it('nimmt die message der Routen ohne athletenFehler', () => {
    const e = fetchFehler({
      statusCode: 400,
      statusMessage: 'Bitte gib den Bestätigungscode ein.',
      message: 'Bitte gib den Bestätigungscode ein.',
    })

    expect(fehlerMeldung(e, 'Fallback')).toBe('Bitte gib den Bestätigungscode ein.')
  })

  it('fällt auf den eigenen Satz zurück, wenn nichts Lesbares ankommt', () => {
    expect(fehlerMeldung(fetchFehler(undefined), 'Fallback')).toBe('Fallback')
    expect(fehlerMeldung(fetchFehler({ statusCode: 500 }), 'Fallback')).toBe('Fallback')
    expect(fehlerMeldung(new TypeError('Failed to fetch'), 'Fallback')).toBe('Fallback')
    expect(fehlerMeldung(null, 'Fallback')).toBe('Fallback')
  })

  // Das setzt Nitro für unbehandelte Fehler — der eigene Satz des Aufrufers ist besser.
  it('verwirft Nitros Server Error', () => {
    const e = fetchFehler({ statusCode: 500, statusMessage: 'Server Error', message: 'Server Error' })

    expect(fehlerMeldung(e, 'Fallback')).toBe('Fallback')
  })

  it('nimmt die Reason-Phrase, wo es sie noch gibt (HTTP/1.1 in der Entwicklung)', () => {
    expect(fehlerMeldung(fetchFehler(undefined, 'Kein Operator-Zugang'), 'Fallback')).toBe(
      'Kein Operator-Zugang',
    )
  })
})
