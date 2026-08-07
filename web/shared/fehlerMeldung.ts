/**
 * Die Meldung aus einem gescheiterten `$fetch` — die eine Stelle, an der die Fläche
 * einen Fehler in einen Satz für den Athleten übersetzt.
 *
 * Bis hierher las jede Fläche `e.statusMessage`, und das war der Grund, warum ein
 * falsches Passwort in Produktion **gar kein** Feedback ergab: `statusMessage` einer
 * `FetchError` ist der `statusText` der Antwort, also die HTTP-Reason-Phrase — und die
 * gibt es ab HTTP/2 nicht mehr. Hinter Cloudflare ist sie deshalb immer `''`. Ein
 * leerer String ist nicht `undefined`, also griff auch das `?? 'Bitte versuch es noch
 * einmal'` daneben: Die Fehlerbox blieb leer und damit unsichtbar.
 *
 * Gelesen wird darum der **Body** der Fehlerantwort (`e.data`), den Nitro als JSON
 * schickt und ofetch bereits geparst hat:
 * - `data.meldung` — ausdrücklich für den Athleten geschrieben (`athletenFehler`).
 * - `message` — was `createError({ statusMessage })` unverstümmelt mitschickt, damit
 *   auch die Routen ankommen, die nichts von `athletenFehler` wissen.
 *
 * `'Server Error'` wird verworfen: Das setzt Nitro für unbehandelte Fehler ein, und der
 * eigene Fallback des Aufrufers ist dann die bessere Auskunft.
 */
interface FetchFehler {
  data?: {
    message?: unknown
    statusMessage?: unknown
    data?: { meldung?: unknown }
  }
  statusMessage?: unknown
}

function alsSatz(wert: unknown): string | null {
  if (typeof wert !== 'string') return null
  const text = wert.trim()
  if (!text || text === 'Server Error') return null
  return text
}

export function fehlerMeldung(fehler: unknown, fallback: string): string {
  const e = (fehler ?? {}) as FetchFehler
  return (
    alsSatz(e.data?.data?.meldung)
    ?? alsSatz(e.data?.message)
    ?? alsSatz(e.data?.statusMessage)
    // Zuletzt die Reason-Phrase: In der lokalen Entwicklung über HTTP/1.1 trägt sie
    // noch etwas, in Produktion ist sie leer und fällt hier durch.
    ?? alsSatz(e.statusMessage)
    ?? fallback
  )
}
