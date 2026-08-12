// Explizit statt über Nitros Auto-Imports: Die Cookie-Hilfen sind der Teil dieses
// Moduls, der sich ohne Nuxt-Umgebung testen lassen muss (authState.test.ts).
import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3'

/**
 * Die **Nutzlast** über den Provider-Hop — kurzlebig im KV, angesprochen über ein
 * Handle im Cookie.
 *
 * Was hier liegt, ist Transport und nur Transport. Den CSRF-Schutz besitzt seit
 * `nuxt-auth-utils` 0.5.30 die Bibliothek: Sie erzeugt ihren eigenen `state`, legt ihn
 * im Cookie `nuxt-auth-state` ab und vergleicht ihn im Callback (GHSA-xc49-mgwh-9pjv).
 * Das ist die Bindung, die dieser Zustand nie hatte — er war einmalig und von uns
 * ausgestellt, aber an **keinen** Browser gebunden: Wer sich selbst einen holte, konnte
 * damit einem fremden Browser einen Callback unterschieben. `authorizationParams.state`
 * wird von beiden Handlern ohnehin überschrieben; ein eigener `state` käme gar nicht
 * mehr beim Provider an.
 *
 * Bleibt die Frage, warum die Nutzlast nicht einfach im Cookie steht: Sie wird größer
 * als das eine Handle. Ab Issue #43 reist Claudes vollständige Autorisierungs-Anfrage
 * mit, und die gehört nicht in einen Header, den jeder Request mitschleppt.
 *
 * Das `SameSite` des Handles ist Apples wegen ein Parameter und keine Konstante: Apple
 * antwortet ausschließlich mit `response_mode=form_post`, also einem **cross-site
 * POST** auf unsere Return-URL — ein `Lax`-Cookie käme dort nicht an. Die Bibliothek
 * setzt ihr eigenes Cookie für Apple aus demselben Grund auf `none`.
 *
 * **Einmalig verwendbar:** Gelesen wird mit Löschen. Ein zweiter Callback mit demselben
 * Handle findet nichts mehr.
 */

const PREFIX = 'authstate:'

/** Name des Cookies, das das Handle über den Hop trägt. */
const COOKIE = 'athlete-auth-state'

/**
 * Zehn Minuten — die Spanne zwischen „auf Anmelden geklickt" und „beim Provider
 * fertig". Länger wäre ein offenes Fenster, kürzer träfe jeden, der bei Apple noch
 * eine Zwei-Faktor-Bestätigung wegdrücken muss.
 */
const TTL_SEKUNDEN = 600

export interface AuthState {
  /**
   * Wohin es nach erfolgreicher Anmeldung geht. Immer ein **lokaler Pfad** — siehe
   * `sichererZielpfad`. Ab Issue #43 reist hier zusätzlich Claudes
   * Autorisierungs-Anfrage mit (client_id, redirect_uri, PKCE-Challenge, Claudes state).
   */
  redirectTo: string
}

/**
 * Nur lokale Pfade sind ein zulässiges Ziel. Ein von außen gesetztes `?redirect=`
 * wäre sonst eine offene Weiterleitung — und zwar eine, die direkt hinter einem
 * erfolgreichen Login sitzt. `//host` und `/\host` sind dabei die Fälle, die eine
 * naive Prüfung auf das führende `/` durchlässt.
 */
export function sichererZielpfad(roh: unknown): string {
  if (typeof roh !== 'string' || !roh.startsWith('/') || roh.startsWith('//')) {
    return '/'
  }
  if (roh.startsWith('/\\')) {
    return '/'
  }
  return roh
}

/** Legt eine Nutzlast ab und liefert das opake Handle. */
export async function putAuthState(kv: KVNamespace, state: AuthState): Promise<string> {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const id = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  await kv.put(`${PREFIX}${id}`, JSON.stringify(state), { expirationTtl: TTL_SEKUNDEN })
  return id
}

/**
 * Holt die Nutzlast zu einem Handle und entwertet sie. `null` heißt: unbekannt,
 * abgelaufen oder schon benutzt — für den Aufrufer derselbe Fall, nämlich Abweisung.
 */
export async function takeAuthState(
  kv: KVNamespace,
  id: unknown,
): Promise<AuthState | null> {
  if (typeof id !== 'string' || !id) {
    return null
  }

  const key = `${PREFIX}${id}`
  const roh = await kv.get(key)
  await kv.delete(key)
  if (!roh) {
    return null
  }

  try {
    const state = JSON.parse(roh) as AuthState
    return { redirectTo: sichererZielpfad(state.redirectTo) }
  } catch {
    return null
  }
}

/**
 * Legt das Handle in den Browser. `sameSite: 'none'` verlangt `secure` — und das ist
 * für Apple auch kein Verlust, weil Apple ohnehin nicht auf `http://localhost`
 * umleitet. Für Google bleibt es bei `lax`, damit die lokale Entwicklung über HTTP
 * weiter funktioniert.
 *
 * `maxAge` ist bewusst dieselbe Zahl wie die KV-TTL: Ein Cookie, das ein totes Handle
 * trägt, ist nur ein irreführender Fehler mehr.
 */
export function setzeAuthStateCookie(
  event: H3Event,
  id: string,
  sameSite: 'lax' | 'none',
): void {
  setCookie(event, COOKIE, id, {
    httpOnly: true,
    secure: sameSite === 'none' || !import.meta.dev,
    sameSite,
    maxAge: TTL_SEKUNDEN,
    path: '/',
  })
}

/**
 * Liest das Handle und räumt das Cookie ab — gelöscht wird auch dann, wenn keines da
 * war, damit ein abgelaufener Rest nicht am nächsten Versuch klebt.
 */
export function nimmAuthStateCookie(event: H3Event): string | undefined {
  const id = getCookie(event, COOKIE)
  deleteCookie(event, COOKIE, { path: '/' })
  return id
}
