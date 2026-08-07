/**
 * Ein Fehler, dessen Meldung **für den Athleten** geschrieben ist — und der auch im
 * Browser ankommt.
 *
 * Der Grund für diese Funktion ist eine Falle in `createError`: Text, der nur in
 * `statusMessage` steht, erreicht die Oberfläche in Produktion **nicht**. Er wird zur
 * HTTP-Reason-Phrase, und die gibt es ab HTTP/2 nicht mehr — hinter Cloudflare kommt
 * beim Browser also ein leerer `statusText` an. Genau das war der Fall, in dem ein
 * falsches Passwort bei Final Surge oder Garmin in einem Formular endete, das
 * kommentarlos wieder dastand. In der lokalen Entwicklung (HTTP/1.1) fiel es nicht auf,
 * dort kam die Meldung an — nur ohne Umlaute, denn die Reason-Phrase ist auf ASCII
 * beschränkt und h3 wirft alles andere heraus.
 *
 * Deshalb geht die Meldung durch `message` in den **Antwort-Body**, wo sie vollständig
 * und unverstümmelt ankommt; gelesen wird sie im Browser von `fehlerMeldung`
 * (`shared/fehlerMeldung.ts`). `statusMessage` bekommt nur die Standard-Reason-Phrase
 * ihres Statuscodes — sie ist eine Protokoll-Angabe, keine Transportfläche für Text an
 * Menschen.
 *
 * Nur für Meldungen, die jemand lesen soll. Ein reiner Guard (401, 403) braucht das
 * nicht — dort liest niemand mit.
 */
const REASON_PHRASE: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
}

export function athletenFehler(statusCode: number, meldung: string) {
  return createError({
    statusCode,
    statusMessage: REASON_PHRASE[statusCode] ?? 'Error',
    message: meldung,
    data: { meldung },
  })
}
