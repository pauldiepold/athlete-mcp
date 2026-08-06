/**
 * Gespeicherte Antwort-Schnipsel des Garmin-SSO — die Grundlage, gegen die der
 * Parsing-Teil (`garminSsoParsing.ts`) getestet wird.
 *
 * **Gekürzt, aber strukturtreu:** Die echten Seiten sind je einige zehn Kilobyte
 * Markup, Skripte und Übersetzungen. Behalten ist genau das, woran der Parser hängt —
 * `<title>`, das `_csrf`-Feld, der Ticket-Link — samt der Umgebung, die ihn stolpern
 * lassen könnte (weitere `value="…"`-Attribute vor dem CSRF-Feld, ein zweiter
 * `embed?ticket=`-Vorkommen im Skript). Personenbezogenes ist entfernt, die Tokens
 * sind erfunden.
 *
 * Ein `.ts`-Modul und keine `.html`-Dateien: `src/` typecheckt ohne @types/node, ein
 * Test mit `readFileSync` würde diese Zusicherung aufgeben.
 */

/** Die Signin-Seite: trägt das `_csrf`-Token, das der Credential-POST braucht. */
export const SIGNIN_SEITE = `<!DOCTYPE html>
<html lang="en">
<head><title>GARMIN Authentication Application</title></head>
<body>
  <form method="post" id="login-form" action="/sso/signin">
    <input type="text" id="username" name="username" value="" autocomplete="off"/>
    <input type="password" id="password" name="password" value=""/>
    <input type="hidden" name="embed" value="true"/>
    <input type="hidden" name="_csrf" value="3F8A21C4-CSRF-SIGNIN"/>
    <button type="submit">Sign In</button>
  </form>
</body>
</html>`;

/** Zugangsdaten akzeptiert, kein zweiter Faktor: die Seite trägt das Service-Ticket. */
export const ERFOLG_SEITE = `<!DOCTYPE html>
<html lang="en">
<head><title>Success</title></head>
<body>
  <script type="text/javascript">
    var response_url = "https:\\/\\/sso.garmin.com\\/sso\\/embed?ticket=ST-1234567-aBcDeFgHiJkLmNoPqRsT-cas";
  </script>
  <a href="https://sso.garmin.com/sso/embed?ticket=ST-1234567-aBcDeFgHiJkLmNoPqRsT-cas">Continue</a>
</body>
</html>`;

/** Das erfundene Ticket in `ERFOLG_SEITE`. */
export const ERFOLG_TICKET = "ST-1234567-aBcDeFgHiJkLmNoPqRsT-cas";

/**
 * Zugangsdaten akzeptiert, aber das Konto verlangt einen zweiten Faktor. Wesentlich:
 * ein **anderes** `_csrf` als auf der Signin-Seite — das ist der Grund, warum der
 * Zwischenzustand ein eigenes Token mitführt.
 */
export const MFA_SEITE = `<!DOCTYPE html>
<html lang="en">
<head><title>GARMIN Authentication Application - MFA</title></head>
<body>
  <form method="post" id="mfa-form" action="/sso/verifyMFA/loginEnterMfaCode">
    <input type="text" name="mfa-code" value="" autocomplete="one-time-code"/>
    <input type="hidden" name="fromPage" value="setupEnterMfaCode"/>
    <input type="hidden" name="embed" value="true"/>
    <input type="hidden" name="_csrf" value="99BB77DD-CSRF-MFA-FRISCH"/>
    <button type="submit">Verify</button>
  </form>
</body>
</html>`;

/** Das frische CSRF-Token in `MFA_SEITE`. */
export const MFA_CSRF = "99BB77DD-CSRF-MFA-FRISCH";

/** Falsches Passwort: Garmin liefert dieselbe Signin-Seite mit einer Fehlermeldung. */
export const ABGELEHNT_SEITE = `<!DOCTYPE html>
<html lang="en">
<head><title>GARMIN Authentication Application</title></head>
<body>
  <div class="error-message">Invalid username or password.</div>
  <form method="post" id="login-form" action="/sso/signin">
    <input type="hidden" name="_csrf" value="3F8A21C4-CSRF-SIGNIN"/>
  </form>
</body>
</html>`;

/** Falscher MFA-Code: wieder die MFA-Seite, nur mit Fehlermeldung. */
export const MFA_ABGELEHNT_SEITE = `<!DOCTYPE html>
<html lang="en">
<head><title>GARMIN Authentication Application - MFA</title></head>
<body>
  <div class="error-message">The code you entered is not valid.</div>
  <form method="post" id="mfa-form" action="/sso/verifyMFA/loginEnterMfaCode">
    <input type="hidden" name="_csrf" value="99BB77DD-CSRF-MFA-FRISCH"/>
  </form>
</body>
</html>`;

/**
 * Konto gesperrt — der dritte Fall, den Garmin über den `<title>` mitteilt. Für den
 * Parser dasselbe wie ein falsches Passwort: abgelehnt, mit einem anderen Titel.
 */
export const GESPERRT_SEITE = `<!DOCTYPE html>
<html lang="en">
<head><title>GARMIN Authentication Application - Account Locked</title></head>
<body><div class="error-message">Your account has been locked.</div></body>
</html>`;

/**
 * Cloudflares Zwischenseite — was zurückkommt, wenn Garmin den Pfad dichtmacht (der
 * Portal-Pfad antwortet dauerhaft so, siehe Spike #38). Trägt nicht Garmins
 * Login-Titel: der Fall, für den es `unlesbar` gibt. Ihn als Ablehnung zu deuten
 * hieße, dem Athleten sein korrektes Passwort vorzuwerfen.
 */
export const CLOUDFLARE_SEITE = `<!DOCTYPE html>
<html><head><title>Just a moment...</title></head>
<body><div id="challenge-running"></div></body></html>`;
