import type { GrantProps } from '../../utils/grantProps'

/**
 * Die Entscheidung des Athleten über eine Autorisierungs-Anfrage — Freigabe oder
 * Ablehnung (Issue #43). Hier und nur hier entsteht ein Grant.
 *
 * Die Anfrage wird **erneut geparst** statt aus dem Aufruf von `anfrage.get.ts`
 * übernommen: Was der Browser zwischendurch geschickt hat, ist kein Beleg dafür, was
 * der Client angefragt hat. Ein Grant über eine Anfrage auszustellen, die der Provider
 * an dieser Stelle nicht selbst gelesen hat, wäre der Punkt, an dem die Consent-Fläche
 * aufhört, eine Prüfung zu sein.
 *
 * CSRF: Die Session ist ein `SameSite=Lax`-Cookie, das bei einem cross-site POST nicht
 * mitgeht — ein von außen erzwungenes Zustimmen käme hier ohne Session an und damit
 * nicht über den 401 hinaus.
 */

export default defineEventHandler(async (event) => {
  const ergebnis = await leseAutorisierungsAnfrage(event)

  if (ergebnis.art !== 'anfrage') {
    return ergebnis
  }

  const { anfrage, client } = ergebnis
  const body = (await readBody(event)) as { zustimmung?: boolean } | undefined

  // Ablehnen ist eine gültige Antwort und keine Panne: Der Client erfährt sie an
  // seiner Redirect-URI, damit er den Versuch beenden kann, statt auf einen Callback
  // zu warten, der nie kommt.
  if (!body?.zustimmung) {
    return {
      art: 'abbruch' as const,
      redirectTo: autorisierungsFehlerUrl(anfrage.redirectUri, {
        code: 'access_denied',
        description: 'Der Athlet hat den Zugriff nicht freigegeben.',
        state: anfrage.state,
        issuer: anfrage.issuer,
      }),
    }
  }

  // Erst hier die Session — wer zustimmt, muss angemeldet sein. `resolveAthlet` wirft
  // 401; die Fläche schickt daraufhin zur Anmeldung und kommt mit derselben Query
  // zurück.
  const { userId, env } = await resolveAthlet(event)

  const { redirectTo } = await oauthHelpers(event).completeAuthorization({
    request: anfrage,
    userId,
    // Unverschlüsselt im KV und damit für eine spätere Operator-Ansicht lesbar
    // („welche Connectoren hängen an wem"). Deshalb nur, was dort auch stehen darf.
    metadata: { clientName: client.clientName ?? null, erteiltAm: new Date().toISOString() },
    scope: anfrage.scope,
    // **Ausschließlich die userId.** Alles andere wird pro Request frisch gelesen —
    // die Begründung steht in `utils/grantProps.ts`.
    props: { userId } satisfies GrantProps,
  })

  // Der Einrichtung sagen, dass der Connector steht (Issue #57). Der Grant selbst
  // wäre der Beweis, aber er ist nur über ein `list` zu finden — *eventually
  // consistent* und am Edge-Cache vorbei; der Haken erschien deshalb erst Minuten
  // später. Der Marker ist ein direkt gelesener Schlüssel und da, sobald der Athlet
  // aus dem Consent zurückkommt.
  //
  // Nach `completeAuthorization` und nicht davor: Der Marker behauptet einen Zugang,
  // den es sonst nicht gäbe. Und ohne `await` im Fehlerfall abzubrechen, wäre falsch
  // herum — scheitert das Schreiben, ist die Freigabe trotzdem erteilt, und der Haken
  // fällt auf den Grant zurück wie bei den Bestandskonten.
  await merkeConnector(env.SESSION_KV, userId).catch((fehler) => {
    console.error('Connector-Marker nicht geschrieben', fehler)
  })

  return { art: 'freigabe' as const, redirectTo }
})
