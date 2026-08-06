/**
 * Der Zwischenzustand einer offenen Garmin-MFA-Abfrage — die Brücke zwischen zwei
 * HTTP-Requests des Athleten (Issue #44).
 *
 * Warum es die überhaupt braucht: Der Widget-Flow zerfällt an der Zwei-Faktor-Abfrage
 * in zwei Hälften. Zwischen „Zugangsdaten abgeschickt" und „Code eingegeben" vergehen
 * Sekunden bis Minuten, in denen der Athlet in seine Authenticator-App schaut — und
 * der Worker hat keinen Prozess, der solange lebt. Der Zustand (Cookies, das frische
 * `_csrf` der MFA-Seite, der Referer, rund 1 kB JSON) muss also irgendwo liegen.
 *
 * Drei Eigenschaften machen ihn ungefährlich:
 * - **Opaker Handle.** Der Browser bekommt nur einen Zufallswert, nie den Zustand. Die
 *   Garmin-Session-Cookies verlassen den Worker nicht.
 * - **Kurzlebig.** Zehn Minuten TTL — länger ist der Code ohnehin nicht gültig, und
 *   ein liegengebliebener Login-Versuch soll von selbst verschwinden.
 * - **Einmalig und kontogebunden.** Das Einlösen löscht den Eintrag, und der Handle
 *   eines fremden Kontos passt nicht: Die `userId` steht im Eintrag und wird geprüft.
 *   Ohne diese Prüfung könnte ein geratener Handle die halbe Garmin-Anmeldung eines
 *   anderen Athleten ins eigene Konto ziehen.
 *
 * Zugangsdaten liegen hier **nicht** drin — die Auflage aus Spike #38 gilt auch für
 * die zehn Minuten dazwischen. Der Zustand trägt nur Cookies und Tokens des Ablaufs.
 */

import { zufallsToken } from "../zufall.js";
import type { MfaZustand } from "./garminSsoLogin.js";

/** Zehn Minuten: länger lebt kein Bestätigungscode. */
export const MFA_TTL_SEKUNDEN = 10 * 60;

const MFA_PREFIX = "garmin:mfa:";

interface Abgelegt {
  userId: string;
  zustand: MfaZustand;
}

/** Legt den Zwischenzustand ab und liefert den opaken Handle für den Browser. */
export async function legeMfaZustandAb(
  kv: KVNamespace,
  userId: string,
  zustand: MfaZustand,
): Promise<string> {
  const handle = zufallsToken(24);
  const eintrag: Abgelegt = { userId, zustand };
  await kv.put(`${MFA_PREFIX}${handle}`, JSON.stringify(eintrag), {
    expirationTtl: MFA_TTL_SEKUNDEN,
  });
  return handle;
}

/**
 * Löst einen Handle ein: liefert den Zustand und **löscht** ihn.
 *
 * null heißt „gibt es nicht (mehr)" — unbekannt, abgelaufen, schon eingelöst oder von
 * einem fremden Konto sind für den Aufrufer derselbe Fall. Wer sie unterscheiden
 * könnte, könnte Handles durchprobieren und aus der Antwort etwas lernen.
 *
 * Gelöscht wird auch dann, wenn der zweite Schritt danach scheitert: Der Zustand ist
 * mit dem Versuch verbraucht — Garmin lehnt dasselbe CSRF-Token ein zweites Mal ohnehin
 * ab, und ein Wiederholversuch beginnt sauber von vorn.
 */
export async function loeseMfaZustandEin(
  kv: KVNamespace,
  userId: string,
  handle: string,
): Promise<MfaZustand | null> {
  if (!handle) return null;

  const key = `${MFA_PREFIX}${handle}`;
  const roh = await kv.get(key);
  if (!roh) return null;

  await kv.delete(key);

  let eintrag: Abgelegt;
  try {
    eintrag = JSON.parse(roh) as Abgelegt;
  } catch {
    return null;
  }

  return eintrag.userId === userId ? eintrag.zustand : null;
}
