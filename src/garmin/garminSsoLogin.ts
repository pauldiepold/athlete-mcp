/**
 * Der Garmin-SSO-Login aus dem Worker (Issue #44, belegt durch Spike #38).
 *
 * Bis hierher wurde das DI-Bündel extern geseedet — ein Operator tippte fremde
 * Passwörter auf seinem Laptop in ein CLI. Diesen Weg gibt es nicht mehr: Der Athlet
 * verbindet Garmin selbst, aus der Weboberfläche.
 *
 * **Der Widget-Flow, nicht OAuth1.** Ältere Notizen im Repo beschreiben den Pfad von
 * `garth` (OAuth1 → OAuth2 mit Consumer-Key). Der Spike hat alle fünf Strategien aus
 * garminconnect 0.3.2 einzeln vermessen: Der Mobile-Pfad läuft dauerhaft in ein
 * clientId-Rate-Limit (429, mit und ohne TLS-Impersonation), der Portal-Pfad in
 * Cloudflare (403 bzw. CAPTCHA). Trägt nur der Widget-Flow — `/sso/embed` →
 * `/sso/signin` mit CSRF → Service-Ticket → `diauth.garmin.com` —, und zwar **ohne**
 * Impersonation: 27 von 27 Durchläufen erfolgreich, im Mittel 3,75 s. Der Ticket-Tausch
 * ist ein Form-POST; OAuth1 und Consumer-Key entfallen vollständig.
 *
 * **Zwei Hälften, weil MFA den Ablauf zerreißt.** `starteGarminLogin` endet entweder
 * fertig oder mit einem vollständig serialisierbaren `MfaZustand`; `beendeGarminLoginMitMfa`
 * setzt allein daraus fort, ohne offene Verbindung. Genau deshalb kann der
 * Zwischenzustand zwischen zwei HTTP-Requests im KV liegen (siehe `garminMfaSpeicher.ts`).
 *
 * **Zwei Auflagen aus dem Spike**, die dieses Modul einlöst:
 * - Zugangsdaten werden **nie gespeichert** — sie sind Argumente dieser Funktionen und
 *   danach weg. Was bleibt, ist das DI-Bündel (`speichereGarmin` in `verbindungen.ts`).
 * - Der Pfad **wird brechen**. Deshalb wirft dieses Modul `GarminLoginFehler` mit einer
 *   für den Athleten formulierten `benutzerMeldung` statt roher HTTP-Texte, und der
 *   Teil, der brechen wird — das Lesen der Seiten —, liegt getestet in
 *   `garminSsoParsing.ts`.
 *
 * Bewusst nur `fetch`, `URLSearchParams` und Regex: keine Node-Builtins, keine
 * Abhängigkeiten. Derselbe Code läuft in workerd und (fürs CLI) in Node.
 */

import type { GarminAnmeldung } from "../verbindungen.js";
import {
  deuteLoginAntwort,
  deuteMfaAntwort,
  extrahiereCsrf,
} from "./garminSsoParsing.js";

const SSO_BASIS = "https://sso.garmin.com/sso";
const SSO_EMBED = `${SSO_BASIS}/embed`;
const CONNECTAPI = "https://connectapi.garmin.com";
const DI_TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";
const DI_GRANT_TYPE =
  "https://connectapi.garmin.com/di-oauth2-service/oauth/grant/service_ticket";

/** Garmin rotiert diese IDs; die erste, die ein Token liefert, gewinnt. */
const DI_CLIENT_IDS = [
  "GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2",
  "GARMIN_CONNECT_MOBILE_ANDROID_DI_2024Q4",
  "GARMIN_CONNECT_MOBILE_ANDROID_DI",
  "GARMIN_CONNECT_MOBILE_IOS_DI",
];

/**
 * Browser-Header. Nicht Kosmetik: Ohne sie antwortet der Portal-Pfad mit 403. Der
 * Widget-Pfad ist toleranter, aber hier steht unverändert, was der Spike in 27
 * Durchläufen verifiziert hat — daran wird nicht aus Geschmack geschraubt.
 */
const BROWSER_HEADER: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua":
    '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "Upgrade-Insecure-Requests": "1",
};

/** Header des nativen Connect-Clients — nur für diauth und die API. */
const NATIVE_HEADER: Record<string, string> = {
  "User-Agent": "GCM-Android-5.23",
  "X-Garmin-User-Agent":
    "com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; " +
    "Android/33; Dalvik/2.1.0",
  "X-Garmin-Paired-App-Version": "10861",
  "X-Garmin-Client-Platform": "Android",
  "X-App-Ver": "10861",
  "X-Lang": "en",
  "X-GCExperience": "GC5",
  "Accept-Language": "en-US,en;q=0.9",
};

const SIGNIN_PARAMS: Record<string, string> = {
  id: "gauth-widget",
  embedWidget: "true",
  gauthHost: SSO_EMBED,
  service: SSO_EMBED,
  source: SSO_EMBED,
  redirectAfterAccountLoginUrl: SSO_EMBED,
  redirectAfterAccountCreationUrl: SSO_EMBED,
};

const EMBED_PARAMS: Record<string, string> = {
  id: "gauth-widget",
  embedWidget: "true",
  gauthHost: SSO_BASIS,
};

/**
 * Alles, was der zweite Schritt braucht, um fortzusetzen — reines JSON, rund 1 kB.
 * Liegt zwischen den beiden HTTP-Requests kurzlebig im KV.
 */
export interface MfaZustand {
  cookies: Record<string, string>;
  /** Das **frische** Token der MFA-Seite, nicht das der Signin-Seite. */
  csrf: string;
  referer: string;
}

/** Wie ein gestarteter Login endet: fertig oder mit offener Zwei-Faktor-Abfrage. */
export type LoginStart =
  | { art: "fertig"; anmeldung: GarminAnmeldung }
  | { art: "mfa"; zustand: MfaZustand };

/**
 * Ein gescheiterter Garmin-Login mit **zwei** Meldungen: `message` fürs Log (roh, mit
 * Schritt und HTTP-Status) und `benutzerMeldung` für die Oberfläche.
 *
 * Die Trennung ist die Auflage aus Spike #38 in Codeform: Der Pfad ist inoffiziell und
 * wird brechen, und dann soll der Athlet eine verständliche Meldung mit
 * Wiederholmöglichkeit sehen — keinen 500er und keinen HTTP-Rohtext.
 */
export class GarminLoginFehler extends Error {
  constructor(
    message: string,
    readonly schritt: string,
    readonly benutzerMeldung: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "GarminLoginFehler";
  }
}

const MELDUNG_ABGELEHNT =
  "Garmin hat die Anmeldung abgelehnt. Bitte prüf E-Mail-Adresse und Passwort — "
  + "es sind die Daten von Garmin Connect, nicht die dieser Seite.";

const MELDUNG_MFA_ABGELEHNT =
  "Garmin hat den Bestätigungscode abgelehnt. Bitte fang die Verbindung noch einmal an "
  + "und gib den neuen Code ein.";

const MELDUNG_RATE_LIMIT =
  "Garmin lässt gerade keine weiteren Anmeldeversuche zu. Bitte versuch es in einigen "
  + "Minuten noch einmal.";

const MELDUNG_UNERREICHBAR =
  "Garmin antwortet gerade nicht wie erwartet. Das liegt nicht an dir — bitte versuch "
  + "es später noch einmal.";

/**
 * Mehrere `Set-Cookie`-Header einzeln auslesen — die eine Stelle, an der Node und
 * workerd auseinanderlaufen: undici kann `getSetCookie()`, ältere Workers-Typen kennen
 * nur `getAll("Set-Cookie")`.
 *
 * Der naheliegende Ausweg `get("set-cookie")` ist eine Falle und deshalb hier kein
 * Fallback: Der Wert wäre eine komma-verbundene Zeichenkette, und `Expires`-Datumsangaben
 * enthalten selbst Kommata („Mon, 04 Aug 2026 …"). Ein Split daran **erfindet** Cookies,
 * statt zu scheitern. Lieber laut abbrechen.
 */
function setCookieWerte(res: Response): string[] {
  const headers = res.headers as Headers & {
    getSetCookie?: () => string[];
    getAll?: (name: string) => string[];
  };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  if (typeof headers.getAll === "function") return headers.getAll("Set-Cookie");
  throw new Error("Laufzeit kann Set-Cookie-Header nicht einzeln auslesen");
}

/**
 * Minimaler Cookie-Jar. Domain und Pfad werden bewusst ignoriert: Der ganze Ablauf
 * spielt auf sso.garmin.com, ein RFC-6265-Parser wäre hier Ballast.
 */
function sammleCookies(res: Response, jar: Record<string, string>): void {
  for (const roh of setCookieWerte(res)) {
    const [paar] = roh.split(";");
    const gleich = paar?.indexOf("=") ?? -1;
    if (!paar || gleich <= 0) continue;
    const name = paar.slice(0, gleich).trim();
    const wert = paar.slice(gleich + 1).trim();
    if (wert === "" || wert === '""') delete jar[name];
    else jar[name] = wert;
  }
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function mitParams(basis: string, params: Record<string, string>): string {
  return `${basis}?${new URLSearchParams(params).toString()}`;
}

/** 429 ist der eine HTTP-Status, der eine eigene Meldung verdient — er geht vorüber. */
function pruefeRateLimit(res: Response, schritt: string): void {
  if (res.status === 429) {
    throw new GarminLoginFehler(
      `Rate-Limit bei ${schritt}`,
      schritt,
      MELDUNG_RATE_LIMIT,
      429,
    );
  }
}

/**
 * Schritt 1 bis 3: Cookies holen, CSRF-Token ziehen, Zugangsdaten abschicken — und
 * bei geglücktem Login gleich das DI-Bündel besorgen.
 *
 * `email` und `password` sind Argumente und werden nirgends abgelegt.
 */
export async function starteGarminLogin(
  email: string,
  password: string,
): Promise<LoginStart> {
  const jar: Record<string, string> = {};

  // Schritt 1: Die Embed-Seite setzt die Session-Cookies.
  const embedRes = await fetch(mitParams(SSO_EMBED, EMBED_PARAMS), {
    headers: BROWSER_HEADER,
  });
  await embedRes.text();
  sammleCookies(embedRes, jar);
  pruefeRateLimit(embedRes, "embed");
  if (!embedRes.ok) {
    throw new GarminLoginFehler(
      `Embed-Seite HTTP ${embedRes.status}`,
      "embed",
      MELDUNG_UNERREICHBAR,
      embedRes.status,
    );
  }

  // Schritt 2: Die Signin-Seite trägt das CSRF-Token im HTML.
  const signinUrl = mitParams(`${SSO_BASIS}/signin`, SIGNIN_PARAMS);
  const csrfRes = await fetch(signinUrl, {
    headers: { ...BROWSER_HEADER, Referer: SSO_EMBED, Cookie: cookieHeader(jar) },
  });
  const csrfBody = await csrfRes.text();
  sammleCookies(csrfRes, jar);
  pruefeRateLimit(csrfRes, "signin-get");
  if (!csrfRes.ok) {
    throw new GarminLoginFehler(
      `Signin-Seite HTTP ${csrfRes.status}`,
      "signin-get",
      MELDUNG_UNERREICHBAR,
      csrfRes.status,
    );
  }
  const csrf = deuteCsrf(csrfBody);

  // Hier steht bewusst **keine** Pause zwischen GET und POST. garminconnect legt an
  // dieser Stelle 3–8 Sekunden ein (`WIDGET_DELAY_MIN_S`), weil eine schnelle
  // GET→POST-Folge als Bot-Muster gilt. Der Spike hat 27 von 27 Läufen ohne sie
  // geschafft, im Mittel 3,75 s insgesamt — und im Worker liefe die Pause in der
  // Wall-Clock-Zeit eines wartenden Athleten mit. Zieht Garmin die Toleranz wieder
  // ein, kommt sie an genau diese Zeile zurück.

  // Schritt 3: Zugangsdaten.
  const loginRes = await fetch(signinUrl, {
    method: "POST",
    headers: {
      ...BROWSER_HEADER,
      Referer: signinUrl,
      Origin: "https://sso.garmin.com",
      Cookie: cookieHeader(jar),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      username: email,
      password,
      embed: "true",
      _csrf: csrf,
    }).toString(),
  });
  const loginBody = await loginRes.text();
  sammleCookies(loginRes, jar);
  pruefeRateLimit(loginRes, "signin-post");

  const antwort = deuteLoginAntwort(loginBody);

  if (antwort.art === "mfa") {
    return {
      art: "mfa",
      zustand: { cookies: jar, csrf: antwort.csrf, referer: signinUrl },
    };
  }
  if (antwort.art === "abgelehnt") {
    throw new GarminLoginFehler(
      `Login abgelehnt, <title>=${JSON.stringify(antwort.titel)}`,
      "signin-post",
      MELDUNG_ABGELEHNT,
      loginRes.status,
    );
  }
  if (antwort.art === "unlesbar") {
    throw new GarminLoginFehler(
      `${antwort.grund}, <title>=${JSON.stringify(antwort.titel)}`,
      "signin-post",
      MELDUNG_UNERREICHBAR,
      loginRes.status,
    );
  }

  return { art: "fertig", anmeldung: await holeAnmeldung(antwort.ticket) };
}

/** Das CSRF-Token der Signin-Seite; ohne es gibt es keinen POST. */
function deuteCsrf(html: string): string {
  const csrf = extrahiereCsrf(html);
  if (!csrf) {
    throw new GarminLoginFehler(
      "Kein _csrf-Token im Signin-HTML",
      "signin-get",
      MELDUNG_UNERREICHBAR,
    );
  }
  return csrf;
}

/**
 * Schritt 3b: Den MFA-Code einlösen. Setzt allein aus dem serialisierten Zustand an —
 * ohne offene Verbindung, also über einen zweiten HTTP-Request des Athleten hinweg.
 */
export async function beendeGarminLoginMitMfa(
  zustand: MfaZustand,
  code: string,
): Promise<GarminAnmeldung> {
  const jar = { ...zustand.cookies };

  const res = await fetch(
    mitParams(`${SSO_BASIS}/verifyMFA/loginEnterMfaCode`, SIGNIN_PARAMS),
    {
      method: "POST",
      headers: {
        ...BROWSER_HEADER,
        Referer: zustand.referer,
        Origin: "https://sso.garmin.com",
        Cookie: cookieHeader(jar),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mfa-code": code,
        embed: "true",
        _csrf: zustand.csrf,
        fromPage: "setupEnterMfaCode",
      }).toString(),
    },
  );
  const body = await res.text();
  pruefeRateLimit(res, "mfa-verify");

  const antwort = deuteMfaAntwort(body);
  if (antwort.art === "abgelehnt") {
    throw new GarminLoginFehler(
      `MFA abgelehnt, <title>=${JSON.stringify(antwort.titel)}`,
      "mfa-verify",
      MELDUNG_MFA_ABGELEHNT,
      res.status,
    );
  }
  if (antwort.art === "unlesbar") {
    throw new GarminLoginFehler(
      `${antwort.grund}, <title>=${JSON.stringify(antwort.titel)}`,
      "mfa-verify",
      MELDUNG_UNERREICHBAR,
      res.status,
    );
  }

  return holeAnmeldung(antwort.ticket);
}

/** Aus einem Service-Ticket wird das, was gespeichert werden darf: Bündel + displayName. */
async function holeAnmeldung(ticket: string): Promise<GarminAnmeldung> {
  const buendel = await tauscheTicket(ticket);
  return { ...buendel, display_name: await holeDisplayName(buendel.di_token) };
}

/**
 * Schritt 4: Das Service-Ticket gegen das DI-Bündel tauschen. Kein OAuth1, keine
 * Signierung — ein Form-POST. `service_url` muss **exakt** die URL sein, mit der der
 * SSO-Login gefahren wurde, sonst weist Garmin das Ticket zurück.
 */
async function tauscheTicket(ticket: string): Promise<{
  di_token: string;
  di_refresh_token: string;
  di_client_id: string;
}> {
  const fehlschlaege: string[] = [];

  for (const clientId of DI_CLIENT_IDS) {
    const res = await fetch(DI_TOKEN_URL, {
      method: "POST",
      headers: {
        ...NATIVE_HEADER,
        Authorization: `Basic ${btoa(`${clientId}:`)}`,
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({
        client_id: clientId,
        service_ticket: ticket,
        grant_type: DI_GRANT_TYPE,
        service_url: SSO_EMBED,
      }).toString(),
    });
    const body = await res.text();

    pruefeRateLimit(res, "di-tausch");
    if (!res.ok) {
      fehlschlaege.push(`${clientId}: HTTP ${res.status}`);
      continue;
    }

    let daten: { access_token?: string; refresh_token?: string };
    try {
      daten = JSON.parse(body) as typeof daten;
    } catch {
      fehlschlaege.push(`${clientId}: Antwort ist kein JSON`);
      continue;
    }
    if (!daten.access_token || !daten.refresh_token) {
      fehlschlaege.push(`${clientId}: Antwort ohne Token`);
      continue;
    }

    return {
      di_token: daten.access_token,
      di_refresh_token: daten.refresh_token,
      di_client_id: clientId,
    };
  }

  throw new GarminLoginFehler(
    `DI-Tausch mit allen client_ids gescheitert: ${fehlschlaege.join("; ")}`,
    "di-tausch",
    MELDUNG_UNERREICHBAR,
  );
}

/**
 * Schritt 5: der `displayName`. Der Schlaf-Endpunkt trägt ihn im Pfad, also gehört er
 * mit zur Anmeldung (siehe docs/garmin-connect-api.md).
 */
async function holeDisplayName(diToken: string): Promise<string> {
  const res = await fetch(`${CONNECTAPI}/userprofile-service/socialProfile`, {
    headers: {
      ...NATIVE_HEADER,
      Authorization: `Bearer ${diToken}`,
      Accept: "application/json",
    },
  });
  const body = await res.text();
  pruefeRateLimit(res, "profil");
  if (!res.ok) {
    throw new GarminLoginFehler(
      `Profil HTTP ${res.status}`,
      "profil",
      MELDUNG_UNERREICHBAR,
      res.status,
    );
  }

  let displayName: string | undefined;
  try {
    displayName = (JSON.parse(body) as { displayName?: string }).displayName;
  } catch {
    displayName = undefined;
  }
  if (!displayName) {
    throw new GarminLoginFehler(
      "Profil-Antwort ohne displayName",
      "profil",
      MELDUNG_UNERREICHBAR,
    );
  }
  return displayName;
}
