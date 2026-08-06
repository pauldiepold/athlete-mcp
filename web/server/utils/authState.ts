/**
 * Der Autorisierungs-Zustand über den Provider-Hop — kurzlebig im KV, **nicht** in
 * einem Cookie.
 *
 * Der Grund ist Apple: Apple antwortet ausschließlich mit `response_mode=form_post`,
 * also einem **cross-site POST** auf unsere Return-URL. Cookies mit `SameSite=Lax` —
 * das sind alle von `nuxt-auth-utils` — werden bei so einem Request nicht mitgeschickt.
 * Alles, was den Hop überqueren muss, liegt deshalb im KV unter einem opaken `state`,
 * den wir dem Provider mitgeben.
 *
 * Bewusst für **beide** Verfahren derselbe Weg, obwohl Googles GET-Callback auch mit
 * einem Cookie auskäme: zwei Pfade wären teurer als der eine. Nebeneffekt und zweiter
 * Grund: Der Apple-Handler von `nuxt-auth-utils` sendet von sich aus **kein** `state`
 * und prüft folglich auch keines — derselbe KV-Zustand liefert den fehlenden
 * CSRF-Schutz gleich mit, weil ein Callback ohne gültigen, von uns ausgestellten
 * `state` abgewiesen wird.
 *
 * **Einmalig verwendbar:** Gelesen wird mit Löschen. Ein zweiter Callback mit demselben
 * `state` findet nichts mehr.
 */

const PREFIX = 'authstate:'

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

/** Legt einen Zustand ab und liefert den opaken `state`, den der Provider zurückbringt. */
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
 * Holt den Zustand zu einem `state` und entwertet ihn. `null` heißt: unbekannt,
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
