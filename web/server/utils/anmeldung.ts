import type { H3Event } from 'h3'
import {
  aktualisiereProfilBeimLogin,
  resolveIdentitaet,
  type Profil,
  type Provider,
} from '@shared/identitaet'

/**
 * Der gemeinsame Kern beider Anmeldeverfahren (ADR-0007). Google und Apple
 * unterscheiden sich für die Identität nur im Präfix — der Provider ist ein Argument,
 * kein Zweig. Was hier steht, ist deshalb genau einmal da: Zustand einlösen, Identität
 * auflösen, Session setzen oder in die Invite-Fläche schicken.
 */

/** Was der Provider über eine Anmeldung mitteilt. Beides darf leer sein. */
export interface ProviderIdentitaet {
  provider: Provider
  sub: string
  /** Nur **Vorbelegung** des Anzeigenamens, nie die Quelle. */
  name: string
  email: string
}

/**
 * Setzt die Session eines angemeldeten Athleten.
 *
 * `user` ist client-sichtbar und trägt nur Anzeige-Material plus das UI-Gate für die
 * Admin-Navigation. Die **Identität** (`provider`/`sub`) liegt in `secure` und damit
 * ausschließlich server-seitig: Sie ist der Anker der Anmeldung und hat im Browser
 * nichts zu suchen. Der Operator-Guard rechnet `operator` server-seitig neu aus dem
 * `secure`-Teil aus — das Feld in `user` steuert nur, ob ein Menüpunkt erscheint.
 */
export async function setzeAthletenSession(
  event: H3Event,
  userId: string,
  identitaet: Pick<ProviderIdentitaet, 'provider' | 'sub'>,
  profil: Profil,
): Promise<void> {
  const operatorSubs = useRuntimeConfig(event).operatorSubs

  // `replaceUserSession` statt `setUserSession`: ein eventuell noch offener
  // `pending`-Zustand aus der Invite-Fläche muss verschwinden, nicht dazugemischt
  // werden. Zusammenführen wäre hier ein Weg, mit fremdem `pending` weiterzulaufen.
  await replaceUserSession(event, {
    user: {
      userId,
      name: profil.anzeigename,
      email: profil.email,
      operator: isOperator(identitaet.provider, identitaet.sub, operatorSubs),
    },
    secure: {
      provider: identitaet.provider,
      sub: identitaet.sub,
    },
  })
}

/**
 * Was nach einem erfolgreichen Provider-Login passiert — für Google und Apple
 * dasselbe.
 *
 * Hat die Identität ein Konto, wird angemeldet und das Profil aufgefrischt (die
 * E-Mail-Adresse ändert sich, der Anzeigename gehört dem Athleten). Hat sie keines,
 * gibt es **kein leeres Konto und keinen Fehler**, sondern den Weg zur Invite-Fläche:
 * Ein Konto entsteht ausschließlich durch Einlösen eines Codes.
 *
 * Der `pending`-Zustand liegt in `secure` — er trägt den `sub`, an dem gleich ein
 * Konto hängen wird; im Browser hätte er nichts zu suchen.
 */
export async function anmeldenNachProviderLogin(
  event: H3Event,
  identitaet: ProviderIdentitaet,
  redirectTo: string,
): Promise<unknown> {
  const kv = envOf(event).SESSION_KV
  const { provider, sub, name, email } = identitaet

  const userId = await resolveIdentitaet(kv, provider, sub)
  if (!userId) {
    await replaceUserSession(event, {
      secure: { pending: { provider, sub, name, email, redirectTo } },
    })
    return sendRedirect(event, '/invite', 302)
  }

  const profil = await aktualisiereProfilBeimLogin(kv, userId, provider, sub, email)
  await setzeAthletenSession(event, userId, identitaet, profil)
  return sendRedirect(event, redirectTo, 302)
}

/**
 * Ein gescheiterter Provider-Login endet auf der Startseite mit einem Hinweis, nicht
 * in einem 500er: Der Athlet soll es noch einmal versuchen können, ohne die URL von
 * Hand zu reparieren.
 */
export function providerFehler(event: H3Event, provider: Provider, error: unknown) {
  console.error(`${provider}-Login fehlgeschlagen:`, error)
  return sendRedirect(event, '/?fehler=anmeldung', 302)
}
