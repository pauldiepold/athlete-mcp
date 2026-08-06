import { GarminLoginFehler } from '@shared/garmin/garminSsoLogin'

/**
 * Die eine Stelle, an der aus einem gescheiterten Garmin-Login eine HTTP-Antwort wird
 * — geteilt von beiden Schritten des Ablaufs (Issue #44).
 *
 * Die rohe Meldung geht ins Log: Sie nennt Schritt und HTTP-Status und ist das
 * Einzige, woran ein gebrochener SSO-Pfad zu erkennen ist. An den Athleten geht die
 * `benutzerMeldung` — Auflage aus Spike #38, denn dieser Pfad ist inoffiziell und
 * **wird** brechen; dann braucht es eine verständliche Meldung mit
 * Wiederholmöglichkeit, keinen 500er.
 *
 * 400 und nicht 502: Der häufigste Fall ist ein falsches Passwort, und die Fläche
 * zeigt die Meldung ohnehin im Formular an. Ein unerwarteter Fehler — Netz weg,
 * Laufzeit anders — bekommt denselben ruhigen Satz; der Athlet kann in beiden Fällen
 * nur dasselbe tun.
 */
export async function mitGarminFehler<T>(
  zweck: string,
  aufruf: () => Promise<T>,
): Promise<T> {
  try {
    return await aufruf()
  } catch (err) {
    console.error(`${zweck} gescheitert:`, err)
    throw createError({
      statusCode: 400,
      statusMessage:
        err instanceof GarminLoginFehler
          ? err.benutzerMeldung
          : 'Die Verbindung zu Garmin hat nicht geklappt. Bitte versuch es noch einmal.',
    })
  }
}
