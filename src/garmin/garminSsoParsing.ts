/**
 * Der **Parsing-Teil** des Garmin-SSO-Logins: aus HTML lesen, was gerade passiert ist.
 *
 * Garmins SSO hat keine API-Antwort — es hat Seiten. Ob ein Login geglückt ist, ob
 * eine Zwei-Faktor-Abfrage kommt oder ob das Passwort falsch war, steht im `<title>`;
 * das CSRF-Token und das Service-Ticket stehen im Markup. Genau das ist der Teil, der
 * **brechen wird**, wenn Garmin sein Login-Formular anfasst (Auflage aus Spike #38:
 * der Pfad ist inoffiziell).
 *
 * Deshalb liegt er hier als reine Funktionen ohne `fetch`, gegen gespeicherte
 * Antwort-Schnipsel getestet: Bricht Garmin etwas, soll ein Test rot werden und nicht
 * ein Athlet vor einer weißen Seite stehen. Der Netz-Teil (`garminSsoLogin.ts`) liegt
 * daneben und hängt sein `fetch` an einer Naht ein — dieselben Schnipsel tragen dort
 * den Ablauf im Test.
 */

/**
 * Der Titel, den Garmins Login-Anwendung trägt — auf dem Formular selbst, nach einem
 * falschen Passwort und auf der Sperrseite (jeweils mit Zusatz).
 *
 * Er ist das Erkennungszeichen dafür, dass wir überhaupt noch mit Garmins SSO reden.
 * Wer ihn nicht trägt, ist keine Ablehnung, sondern etwas Fremdes — eine
 * Cloudflare-Challenge, eine Wartungsseite, ein Redirect ins Nichts.
 */
const GARMIN_LOGIN_TITEL = "GARMIN Authentication Application";

const TITEL_RE = /<title>(.+?)<\/title>/;
const CSRF_RE = /name="_csrf"\s+value="(.+?)"/;
const TICKET_RE = /embed\?ticket=([^"]+)"/;

/** Der `<title>` einer SSO-Seite — Garmins einziges Statussignal. Leer, wenn keiner da ist. */
export function extrahiereTitel(html: string): string {
  return TITEL_RE.exec(html)?.[1] ?? "";
}

/** Das `_csrf`-Token aus einem Formular; null, wenn keins drinsteht. */
export function extrahiereCsrf(html: string): string | null {
  return CSRF_RE.exec(html)?.[1] ?? null;
}

/** Das Service-Ticket aus der Erfolgsseite; null, wenn keins drinsteht. */
export function extrahiereTicket(html: string): string | null {
  return TICKET_RE.exec(html)?.[1] ?? null;
}

/**
 * Was die Antwort auf abgeschickte Zugangsdaten bedeutet.
 *
 * `abgelehnt` und `unlesbar` sind bewusst getrennt, obwohl beide für den Athleten in
 * „hat nicht geklappt" münden: `abgelehnt` heißt „Garmin hat geantwortet und nein
 * gesagt" (falsches Passwort — der Athlet kann etwas tun), `unlesbar` heißt „da kam
 * etwas, das wir nicht mehr verstehen" (der Pfad ist gebrochen — er kann nichts tun,
 * und ihn nach seinem Passwort zu fragen wäre falsch).
 *
 * Deshalb ist `abgelehnt` an Garmins Login-Titel gebunden und nicht der Rest-Fall.
 * Andersherum — alles außer „Success" ist eine Ablehnung — bekäme der Athlet vor einer
 * Cloudflare-Challenge zu lesen, sein Passwort stimme nicht, und tippte es korrekt
 * noch einmal ein. Genau dieser Fall kommt vor: Der Portal-Pfad antwortet dauerhaft
 * mit einem CAPTCHA (Spike #38).
 */
export type LoginAntwort =
  | { art: "erfolg"; ticket: string }
  | { art: "mfa"; csrf: string }
  | { art: "abgelehnt"; titel: string }
  | { art: "unlesbar"; titel: string; grund: string };

/**
 * Alles außer dem Erfolg: Garmins eigene Ablehnung von etwas Fremdem unterscheiden.
 * Geteilt von beiden Schritten, weil die Frage in beiden dieselbe ist.
 */
function deuteFehlschlag(titel: string): Exclude<LoginAntwort, { art: "mfa" | "erfolg" }> {
  return titel.includes(GARMIN_LOGIN_TITEL)
    ? { art: "abgelehnt", titel }
    : {
        art: "unlesbar",
        titel,
        grund: "Antwort trägt nicht Garmins Login-Titel",
      };
}

/** Erfolgsseite ohne Ticket ist kein Erfolg — ein erfundenes wäre schlimmer als ein Fehlschlag. */
function deuteErfolg(html: string, titel: string): Exclude<LoginAntwort, { art: "mfa" }> {
  const ticket = extrahiereTicket(html);
  return ticket
    ? { art: "erfolg", ticket }
    : { art: "unlesbar", titel, grund: "Erfolgsseite ohne Service-Ticket" };
}

/** Die Antwort auf den Credential-POST. */
export function deuteLoginAntwort(html: string): LoginAntwort {
  const titel = extrahiereTitel(html);

  // Die MFA-Seite trägt ein **frisches** CSRF-Token; das aus dem Signin-Formular gilt
  // ab hier nicht mehr. Ohne dieses Nachziehen scheiterte der zweite Schritt mit einer
  // Meldung, die nach „falscher Code" aussieht, obwohl der Code stimmte.
  if (titel.includes("MFA")) {
    const csrf = extrahiereCsrf(html);
    return csrf
      ? { art: "mfa", csrf }
      : { art: "unlesbar", titel, grund: "MFA-Seite ohne _csrf-Token" };
  }

  return titel === "Success" ? deuteErfolg(html, titel) : deuteFehlschlag(titel);
}

/** Was die Antwort auf einen abgeschickten MFA-Code bedeutet — hier gibt es kein MFA mehr. */
export function deuteMfaAntwort(
  html: string,
): Exclude<LoginAntwort, { art: "mfa" }> {
  const titel = extrahiereTitel(html);

  return titel === "Success" ? deuteErfolg(html, titel) : deuteFehlschlag(titel);
}
