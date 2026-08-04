/**
 * Spike zu Issue #38 — Wegwerf-Code, keine Tests.
 *
 * TS-Portierung des Garmin-Widget-SSO-Logins. Bewusst nur `fetch`, `URLSearchParams`
 * und Regex: keine Node-Builtins, keine Abhaengigkeiten. Damit laeuft derselbe Code
 * unveraendert lokal (Node) und im Cloudflare-Worker — genau das ist der Punkt der
 * Messung, die das Issue verlangt.
 *
 * Warum der Widget-Flow und nicht der Mobile-Flow, den das Issue beschreibt:
 * Phase 0 hat die fuenf Strategien aus garminconnect 0.3.2 einzeln vermessen. Der
 * Mobile-Pfad laeuft in ein erschoepftes clientId-Rate-Limit (429, unabhaengig vom
 * Transport), der Portal-Pfad in Cloudflare (403 plain / CAPTCHA_REQUIRED mit
 * Impersonation). Nur der Widget-Flow traegt — und zwar **ohne** TLS-Impersonation.
 *
 * Der Ablauf ist bewusst in zwei Haelften geschnitten, weil MFA ihn zerreisst:
 *
 *   beginLogin()  Embed -> CSRF -> POST Credentials.
 *                 Ergebnis: entweder fertig, oder `mfa_required` samt einem
 *                 vollstaendig serialisierbaren `MfaState`.
 *   resumeLogin() MFA-Code einloesen -> Service-Ticket -> DI-Tausch.
 *
 * `MfaState` ist reines JSON (Cookies + CSRF + Referer) und damit genau das, was
 * im Worker fuer ~10 Minuten ins KV gehoert.
 */

const SSO_BASE = "https://sso.garmin.com/sso";
const SSO_EMBED = `${SSO_BASE}/embed`;
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
 * Browser-Header. Nicht Kosmetik: der Portal-Pfad antwortet ohne sie mit 403.
 * Der Widget-Pfad ist toleranter, aber wir aendern hier nichts gegenueber dem
 * in Phase 0 verifizierten Lauf.
 */
const BROWSER_HEADERS: Record<string, string> = {
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

/** Header des nativen Connect-Clients — nur fuer diauth und die API. */
const NATIVE_HEADERS: Record<string, string> = {
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
  gauthHost: SSO_BASE,
};

export interface GarminTokens {
  di_token: string;
  di_refresh_token: string;
  di_client_id: string;
}

/**
 * Alles, was der zweite Request braucht, um den Login fortzusetzen — reines
 * JSON. Im Worker liegt das mit kurzer TTL im KV.
 */
export interface MfaState {
  cookies: Record<string, string>;
  csrf: string;
  referer: string;
}

export type BeginResult =
  | { status: "success"; ticket: string; cookies: Record<string, string> }
  | { status: "mfa_required"; state: MfaState };

export interface Trace {
  step: string;
  status: number;
  title?: string;
  cfRay?: string;
  bytes: number;
}

export class GarminLoginError extends Error {
  constructor(
    message: string,
    readonly step: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "GarminLoginError";
  }
}

/**
 * Mehrere `Set-Cookie`-Header einzeln auslesen — die eine Stelle, an der Node
 * und workerd auseinanderlaufen: undici kann `getSetCookie()`, die Workers-
 * Typen kennen nur `getAll("Set-Cookie")`.
 *
 * Der naheliegende Ausweg `get("set-cookie")` ist eine Falle und deshalb hier
 * kein Fallback: der Wert waere eine komma-verbundene Zeichenkette, und
 * `Expires`-Datumsangaben enthalten selbst Kommata ("Mon, 04 Aug 2026 …").
 * Ein Split daran erfindet Cookies, statt zu scheitern. Lieber laut abbrechen.
 */
function setCookieValues(res: Response): string[] {
  const headers = res.headers as Headers & {
    getSetCookie?: () => string[];
    getAll?: (name: string) => string[];
  };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  if (typeof headers.getAll === "function") return headers.getAll("Set-Cookie");
  throw new Error("Laufzeit kann Set-Cookie-Header nicht einzeln auslesen");
}

/**
 * Minimaler Cookie-Jar. Domain und Pfad werden bewusst ignoriert: der ganze
 * Flow spielt auf sso.garmin.com, und ein Spike braucht keinen RFC-6265-Parser.
 */
function collectCookies(res: Response, into: Record<string, string>): void {
  for (const raw of setCookieValues(res)) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value === "" || value === '""') delete into[name];
    else into[name] = value;
  }
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function url(base: string, params: Record<string, string>): string {
  return `${base}?${new URLSearchParams(params).toString()}`;
}

const TITLE_RE = /<title>(.+?)<\/title>/;
const CSRF_RE = /name="_csrf"\s+value="(.+?)"/;
const TICKET_RE = /embed\?ticket=([^"]+)"/;

function titleOf(html: string): string {
  return TITLE_RE.exec(html)?.[1] ?? "";
}

function trace(step: string, res: Response, body: string): Trace {
  return {
    step,
    status: res.status,
    title: titleOf(body) || undefined,
    cfRay: res.headers.get("cf-ray") ?? undefined,
    bytes: body.length,
  };
}

/**
 * Schritt 1 bis 3: Cookies holen, CSRF-Token ziehen, Credentials abschicken.
 *
 * Die Pause zwischen GET und POST ist kein Aberglaube — sie stammt aus
 * garminconnect (`WIDGET_DELAY_MIN_S`), wo eine schnelle GET->POST-Folge als
 * Bot-Muster gilt. Im Worker kostet sie Wall-Clock-Zeit im Request des
 * Athleten, deshalb ist sie hier abschaltbar: ob sie wirklich noetig ist,
 * gehoert zu dem, was der Spike messen soll.
 */
export async function beginLogin(
  email: string,
  password: string,
  opts: { delayMs?: number; traces?: Trace[] } = {},
): Promise<BeginResult> {
  const jar: Record<string, string> = {};
  const traces = opts.traces ?? [];

  // Schritt 1: Embed-Seite — setzt die Session-Cookies.
  const embedRes = await fetch(url(SSO_EMBED, EMBED_PARAMS), {
    headers: BROWSER_HEADERS,
  });
  const embedBody = await embedRes.text();
  traces.push(trace("embed", embedRes, embedBody));
  collectCookies(embedRes, jar);
  if (!embedRes.ok) {
    throw new GarminLoginError(
      `Embed-Seite HTTP ${embedRes.status}`,
      "embed",
      embedRes.status,
    );
  }

  // Schritt 2: Signin-Seite — traegt das CSRF-Token im HTML.
  const signinUrl = url(`${SSO_BASE}/signin`, SIGNIN_PARAMS);
  const csrfRes = await fetch(signinUrl, {
    headers: { ...BROWSER_HEADERS, Referer: SSO_EMBED, Cookie: cookieHeader(jar) },
  });
  const csrfBody = await csrfRes.text();
  traces.push(trace("signin-get", csrfRes, csrfBody));
  collectCookies(csrfRes, jar);
  if (!csrfRes.ok) {
    throw new GarminLoginError(
      `Signin-Seite HTTP ${csrfRes.status}`,
      "signin-get",
      csrfRes.status,
    );
  }
  const csrf = CSRF_RE.exec(csrfBody)?.[1];
  if (!csrf) {
    throw new GarminLoginError("Kein _csrf-Token im Signin-HTML", "signin-get");
  }

  const delayMs = opts.delayMs ?? 3000 + Math.random() * 5000;
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

  // Schritt 3: Credentials.
  const loginRes = await fetch(signinUrl, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
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
  traces.push(trace("signin-post", loginRes, loginBody));
  collectCookies(loginRes, jar);

  if (loginRes.status === 429) {
    throw new GarminLoginError("Rate-Limit beim Login", "signin-post", 429);
  }

  const title = titleOf(loginBody);

  if (title.includes("MFA")) {
    // Die MFA-Seite traegt ein **frisches** CSRF-Token; das alte gilt nicht mehr.
    const mfaCsrf = CSRF_RE.exec(loginBody)?.[1];
    if (!mfaCsrf) {
      throw new GarminLoginError("Kein _csrf auf der MFA-Seite", "signin-post");
    }
    return { status: "mfa_required", state: { cookies: jar, csrf: mfaCsrf, referer: signinUrl } };
  }

  if (title !== "Success") {
    throw new GarminLoginError(
      `Login fehlgeschlagen, <title>=${JSON.stringify(title)}`,
      "signin-post",
      loginRes.status,
    );
  }

  const ticket = TICKET_RE.exec(loginBody)?.[1];
  if (!ticket) {
    throw new GarminLoginError("Kein Service-Ticket im Erfolgs-HTML", "signin-post");
  }
  return { status: "success", ticket, cookies: jar };
}

/**
 * Schritt 3b: MFA-Code einloesen. Setzt genau dort an, wo `beginLogin` aufgehoert
 * hat — allein aus dem serialisierten Zustand, ohne offene Verbindung.
 */
export async function submitMfaCode(
  state: MfaState,
  code: string,
  opts: { traces?: Trace[] } = {},
): Promise<{ ticket: string; cookies: Record<string, string> }> {
  const traces = opts.traces ?? [];
  const jar = { ...state.cookies };

  const res = await fetch(url(`${SSO_BASE}/verifyMFA/loginEnterMfaCode`, SIGNIN_PARAMS), {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      Referer: state.referer,
      Origin: "https://sso.garmin.com",
      Cookie: cookieHeader(jar),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      "mfa-code": code,
      embed: "true",
      _csrf: state.csrf,
      fromPage: "setupEnterMfaCode",
    }).toString(),
  });
  const body = await res.text();
  traces.push(trace("mfa-verify", res, body));
  collectCookies(res, jar);

  if (res.status === 429) {
    throw new GarminLoginError("Rate-Limit beim MFA-Einloesen", "mfa-verify", 429);
  }

  const title = titleOf(body);
  if (title !== "Success") {
    throw new GarminLoginError(
      `MFA fehlgeschlagen, <title>=${JSON.stringify(title)}`,
      "mfa-verify",
      res.status,
    );
  }

  const ticket = TICKET_RE.exec(body)?.[1];
  if (!ticket) {
    throw new GarminLoginError("Kein Service-Ticket nach MFA", "mfa-verify");
  }
  return { ticket, cookies: jar };
}

/**
 * Schritt 4: Service-Ticket gegen das DI-Bundle tauschen. Kein OAuth1, keine
 * Signierung — ein Form-POST. `service_url` muss exakt die URL sein, mit der
 * der SSO-Login gefahren wurde, sonst weist Garmin das Ticket zurueck.
 */
export async function exchangeTicket(
  ticket: string,
  opts: { traces?: Trace[] } = {},
): Promise<GarminTokens> {
  const traces = opts.traces ?? [];
  const failures: string[] = [];

  for (const clientId of DI_CLIENT_IDS) {
    const res = await fetch(DI_TOKEN_URL, {
      method: "POST",
      headers: {
        ...NATIVE_HEADERS,
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
    traces.push(trace(`di[${clientId}]`, res, body));

    if (res.status === 429) {
      throw new GarminLoginError("Rate-Limit beim DI-Tausch", "di-exchange", 429);
    }
    if (!res.ok) {
      failures.push(`${clientId}: HTTP ${res.status}`);
      continue;
    }

    const data = JSON.parse(body) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!data.access_token || !data.refresh_token) {
      failures.push(`${clientId}: Antwort ohne Token`);
      continue;
    }
    return {
      di_token: data.access_token,
      di_refresh_token: data.refresh_token,
      di_client_id: clientId,
    };
  }

  throw new GarminLoginError(
    `DI-Tausch mit allen client_ids gescheitert: ${failures.join("; ")}`,
    "di-exchange",
  );
}

/**
 * Schritt 5: displayName. Der Sleep-Endpoint braucht ihn im Pfad, deshalb
 * gehoert er mit ins Seed-Ergebnis (vgl. docs/garmin-connect-api.md).
 */
export async function fetchDisplayName(
  tokens: GarminTokens,
  opts: { traces?: Trace[] } = {},
): Promise<string> {
  const traces = opts.traces ?? [];
  const res = await fetch(`${CONNECTAPI}/userprofile-service/socialProfile`, {
    headers: {
      ...NATIVE_HEADERS,
      Authorization: `Bearer ${tokens.di_token}`,
      Accept: "application/json",
    },
  });
  const body = await res.text();
  traces.push(trace("profile", res, body));
  if (!res.ok) {
    throw new GarminLoginError(`Profil HTTP ${res.status}`, "profile", res.status);
  }
  const displayName = (JSON.parse(body) as { displayName?: string }).displayName;
  if (!displayName) {
    throw new GarminLoginError("Antwort ohne displayName", "profile");
  }
  return displayName;
}

/** Der ganze Pfad ohne MFA — der Fall des Test-Kontos. */
export async function loginWithoutMfa(
  email: string,
  password: string,
  opts: { delayMs?: number; traces?: Trace[] } = {},
): Promise<GarminTokens & { display_name: string }> {
  const result = await beginLogin(email, password, opts);
  if (result.status === "mfa_required") {
    throw new GarminLoginError("Konto verlangt MFA", "signin-post");
  }
  const tokens = await exchangeTicket(result.ticket, opts);
  const display_name = await fetchDisplayName(tokens, opts);
  return { ...tokens, display_name };
}
