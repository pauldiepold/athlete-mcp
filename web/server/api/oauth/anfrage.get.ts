/**
 * Was auf dem Consent-Screen steht — die Anfrage, wie der Authorization Server sie
 * gelesen hat (Issue #43).
 *
 * Bewusst **ohne Session-Zwang**: Eine kaputte Autorisierungs-Anfrage soll auffliegen,
 * *bevor* der Athlet durch einen Google- oder Apple-Login geschickt wird — sonst
 * meldet er sich an, um danach eine Fehlermeldung zu lesen. Preisgegeben wird dabei
 * nichts Persönliches: Client-Name und Redirect-Ziel stammen aus der offenen
 * Client-Registrierung, nicht aus einem Konto.
 *
 * Die eigentliche Prüfung sitzt an der Freigabe (`freigabe.post.ts`) — dort, wo aus
 * einer Anfrage ein Grant wird.
 */

export default defineEventHandler(async (event) => {
  const ergebnis = await leseAutorisierungsAnfrage(event)

  if (ergebnis.art !== 'anfrage') {
    return ergebnis
  }

  const { anfrage, client } = ergebnis

  return {
    art: 'anfrage' as const,
    // Alles frei gewählte Angaben aus der Client-Registrierung — die Fläche zeigt sie
    // als Behauptung des Clients, nicht als geprüfte Identität. Verlässlich ist allein
    // das Redirect-Ziel: Dorthin geht der Code, und nur eine registrierte URI kommt
    // überhaupt bis hierher.
    clientName: client.clientName ?? null,
    policyUri: client.policyUri ?? null,
    tosUri: client.tosUri ?? null,
    redirectHost: new URL(anfrage.redirectUri).host,
    scopes: anfrage.scope,
  }
})
