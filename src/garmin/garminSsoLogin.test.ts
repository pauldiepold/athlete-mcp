import { describe, it, expect } from "vitest";

import {
  GarminLoginFehler,
  beendeGarminLoginMitMfa,
  starteGarminLogin,
  type MfaZustand,
  type NetzZugang,
} from "./garminSsoLogin.js";
import {
  ABGELEHNT_SEITE,
  CLOUDFLARE_SEITE,
  DI_REFRESH_TOKEN,
  DI_TOKEN,
  DI_TOKEN_ANTWORT,
  EMBED_COOKIES,
  EMBED_SEITE,
  ERFOLG_SEITE,
  ERFOLG_TICKET,
  MFA_ABGELEHNT_SEITE,
  MFA_CSRF,
  MFA_SEITE,
  PROFIL_ANTWORT,
  PROFIL_DISPLAY_NAME,
  SIGNIN_CSRF,
  SIGNIN_SEITE,
} from "./fixtures/ssoAntworten.js";

/**
 * Der **Ablauf** des Garmin-Logins unter Test — das, was `garminSsoParsing.test.ts`
 * nicht sieht: die Reihenfolge der sechs Requests, die Weitergabe der Cookies, das
 * frische CSRF-Token der MFA-Seite und die `DI_CLIENT_IDS`-Schleife.
 *
 * Möglich wird das durch die Naht in `garminSsoLogin.ts`: `fetch` ist ein defaultetes
 * Argument, hier eingespeist als Fixture-Netz, das nach URL und Methode antwortet.
 * Die Antworten sind dieselben gespeicherten Schnipsel, gegen die der Parser läuft.
 */

/** Ein aufgezeichneter Request — genug, um Ziel, Header und Formularfelder zu prüfen. */
interface Aufruf {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Der Body als geparstes Formular; leer, wo keiner geschickt wurde. */
  felder: URLSearchParams;
}

/**
 * Wie das Fixture-Netz auf die sechs Schritte antwortet. Jeder Schritt hat eine
 * Vorgabe, die dem geglückten Durchlauf entspricht; ein Test überschreibt genau den
 * Schritt, um den es ihm geht.
 */
interface NetzPlan {
  embed?: () => Response;
  signinGet?: () => Response;
  signinPost?: () => Response;
  mfaPost?: () => Response;
  /** Bekommt die `client_id` des Versuchs — so lässt sich die Schleife vermessen. */
  diTausch?: (clientId: string) => Response;
  profil?: () => Response;
}

/** Die Embed-Antwort samt ihrer beiden `Set-Cookie`-Header. */
function embedAntwort(): Response {
  const headers = new Headers({ "Content-Type": "text/html" });
  for (const cookie of EMBED_COOKIES) headers.append("Set-Cookie", cookie);
  return new Response(EMBED_SEITE, { headers });
}

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html" } });

const json = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "application/json" } });

/**
 * Das Fixture-Netz: routet nach URL **und** Methode, weil `/sso/signin` zweimal
 * vorkommt — einmal als GET fürs CSRF-Token, einmal als POST mit den Zugangsdaten.
 * Eine unbekannte URL ist ein Testfehler und keine leere Antwort: Sie hieße, dass der
 * Ablauf sich geändert hat, ohne dass ein Test es merkt.
 */
function baueNetz(plan: NetzPlan = {}): { netz: NetzZugang; aufrufe: Aufruf[] } {
  const aufrufe: Aufruf[] = [];

  const netz: NetzZugang = async (url, init) => {
    const method = init?.method ?? "GET";
    const felder = new URLSearchParams(init?.body ?? "");
    aufrufe.push({ url, method, headers: { ...(init?.headers ?? {}) }, felder });

    if (url.includes("/sso/embed?")) return (plan.embed ?? embedAntwort)();
    if (url.includes("/sso/signin?")) {
      return method === "POST"
        ? (plan.signinPost ?? (() => html(ERFOLG_SEITE)))()
        : (plan.signinGet ?? (() => html(SIGNIN_SEITE)))();
    }
    if (url.includes("/sso/verifyMFA/")) {
      return (plan.mfaPost ?? (() => html(ERFOLG_SEITE)))();
    }
    if (url.includes("diauth.garmin.com")) {
      const clientId = felder.get("client_id") ?? "";
      return (plan.diTausch ?? (() => json(DI_TOKEN_ANTWORT)))(clientId);
    }
    if (url.includes("/userprofile-service/socialProfile")) {
      return (plan.profil ?? (() => json(PROFIL_ANTWORT)))();
    }

    throw new Error(`Fixture-Netz kennt diese URL nicht: ${method} ${url}`);
  };

  return { netz, aufrufe };
}

/** Nimmt den erwarteten `GarminLoginFehler` entgegen — oder scheitert, wenn keiner kommt. */
async function fangeLoginFehler(lauf: Promise<unknown>): Promise<GarminLoginFehler> {
  try {
    await lauf;
  } catch (fehler) {
    expect(fehler).toBeInstanceOf(GarminLoginFehler);
    return fehler as GarminLoginFehler;
  }
  throw new Error("Erwartet war ein GarminLoginFehler — der Lauf ging durch.");
}

const ERSTE_CLIENT_ID = "GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2";
const ZWEITE_CLIENT_ID = "GARMIN_CONNECT_MOBILE_ANDROID_DI_2024Q4";

describe("starteGarminLogin — glatter Durchlauf", () => {
  it("kommt ohne MFA bis zur fertigen Anmeldung", async () => {
    const { netz } = baueNetz();

    const ergebnis = await starteGarminLogin("athlet@example.com", "geheim", { netz });

    expect(ergebnis).toEqual({
      art: "fertig",
      anmeldung: {
        di_token: DI_TOKEN,
        di_refresh_token: DI_REFRESH_TOKEN,
        di_client_id: ERSTE_CLIENT_ID,
        display_name: PROFIL_DISPLAY_NAME,
      },
    });
  });

  it("geht die fünf Schritte in der vom Spike verifizierten Reihenfolge", async () => {
    const { netz, aufrufe } = baueNetz();

    await starteGarminLogin("athlet@example.com", "geheim", { netz });

    expect(
      aufrufe.map((a) => `${a.method} ${a.url.split("?")[0]}`),
    ).toEqual([
      "GET https://sso.garmin.com/sso/embed",
      "GET https://sso.garmin.com/sso/signin",
      "POST https://sso.garmin.com/sso/signin",
      "POST https://diauth.garmin.com/di-oauth2-service/oauth/token",
      "GET https://connectapi.garmin.com/userprofile-service/socialProfile",
    ]);
  });

  it("schickt die Zugangsdaten als Form-POST an /sso/signin, mit dem CSRF-Feld", async () => {
    const { netz, aufrufe } = baueNetz();

    await starteGarminLogin("athlet@example.com", "geheim", { netz });

    const post = aufrufe[2]!;
    expect(post.url.startsWith("https://sso.garmin.com/sso/signin?")).toBe(true);
    expect(post.felder.get("username")).toBe("athlet@example.com");
    expect(post.felder.get("password")).toBe("geheim");
    expect(post.felder.get("embed")).toBe("true");
    expect(post.felder.get("_csrf")).toBe(SIGNIN_CSRF);
    expect(post.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(post.headers.Origin).toBe("https://sso.garmin.com");
  });

  it("reicht die Cookies der Embed-Seite an die folgenden Schritte weiter", async () => {
    // Der Embed-Schritt existiert nur für diese Cookies — kämen sie nicht mit, wäre
    // der Credential-POST sessionlos.
    const { netz, aufrufe } = baueNetz();

    await starteGarminLogin("athlet@example.com", "geheim", { netz });

    const erwartet =
      "GARMIN-SSO=1; GARMIN-SSO-GUID=ABCDEF0123456789ABCDEF0123456789";
    expect(aufrufe[1]!.headers.Cookie).toBe(erwartet);
    expect(aufrufe[2]!.headers.Cookie).toBe(erwartet);
  });

  it("tauscht das Ticket mit exakt der Embed-URL als service_url", async () => {
    // `service_url` muss die URL sein, mit der der SSO-Login gefahren wurde, sonst
    // weist Garmin das Ticket zurück.
    const { netz, aufrufe } = baueNetz();

    await starteGarminLogin("athlet@example.com", "geheim", { netz });

    const tausch = aufrufe[3]!;
    expect(tausch.felder.get("service_ticket")).toBe(ERFOLG_TICKET);
    expect(tausch.felder.get("service_url")).toBe("https://sso.garmin.com/sso/embed");
    expect(tausch.headers.Authorization).toBe(`Basic ${btoa(`${ERSTE_CLIENT_ID}:`)}`);
  });

  it("holt den displayName mit dem frisch getauschten DI-Token", async () => {
    const { netz, aufrufe } = baueNetz();

    await starteGarminLogin("athlet@example.com", "geheim", { netz });

    expect(aufrufe[4]!.headers.Authorization).toBe(`Bearer ${DI_TOKEN}`);
  });
});

describe("starteGarminLogin — Zwei-Faktor-Abfrage", () => {
  it("endet mit einem serialisierbaren Zustand statt mit einer Anmeldung", async () => {
    const { netz, aufrufe } = baueNetz({ signinPost: () => html(MFA_SEITE) });

    const ergebnis = await starteGarminLogin("athlet@example.com", "geheim", { netz });

    expect(ergebnis.art).toBe("mfa");
    const zustand = (ergebnis as { art: "mfa"; zustand: MfaZustand }).zustand;
    expect(zustand.cookies).toEqual({
      "GARMIN-SSO": "1",
      "GARMIN-SSO-GUID": "ABCDEF0123456789ABCDEF0123456789",
    });
    expect(zustand.referer.startsWith("https://sso.garmin.com/sso/signin?")).toBe(true);
    // Rund ein Kilobyte reines JSON — genau das, was zwischen zwei HTTP-Requests
    // im KV liegen können muss.
    expect(JSON.parse(JSON.stringify(zustand))).toEqual(zustand);
    // Nach der MFA-Seite ist Schluss: kein Ticket-Tausch, kein Profilabruf.
    expect(aufrufe).toHaveLength(3);
  });

  it("nimmt das frische Token der MFA-Seite mit, nicht das des Signin-Formulars", async () => {
    const { netz } = baueNetz({ signinPost: () => html(MFA_SEITE) });

    const ergebnis = await starteGarminLogin("athlet@example.com", "geheim", { netz });

    const zustand = (ergebnis as { art: "mfa"; zustand: MfaZustand }).zustand;
    expect(zustand.csrf).toBe(MFA_CSRF);
    expect(zustand.csrf).not.toBe(SIGNIN_CSRF);
  });
});

describe("beendeGarminLoginMitMfa", () => {
  /** Der Zustand, wie ihn `starteGarminLogin` hinterlässt — einmal durchs KV gedacht. */
  async function offenerZustand(): Promise<MfaZustand> {
    const { netz } = baueNetz({ signinPost: () => html(MFA_SEITE) });
    const ergebnis = await starteGarminLogin("athlet@example.com", "geheim", { netz });
    const zustand = (ergebnis as { art: "mfa"; zustand: MfaZustand }).zustand;
    return JSON.parse(JSON.stringify(zustand)) as MfaZustand;
  }

  it("setzt allein aus dem Zustand fort und liefert die fertige Anmeldung", async () => {
    const zustand = await offenerZustand();
    const { netz, aufrufe } = baueNetz();

    const anmeldung = await beendeGarminLoginMitMfa(zustand, "123456", { netz });

    expect(anmeldung).toEqual({
      di_token: DI_TOKEN,
      di_refresh_token: DI_REFRESH_TOKEN,
      di_client_id: ERSTE_CLIENT_ID,
      display_name: PROFIL_DISPLAY_NAME,
    });
    // Kein zweiter Login: der Ablauf setzt hinter dem Credential-POST an.
    expect(aufrufe.map((a) => a.method)).toEqual(["POST", "POST", "GET"]);
  });

  it("verwendet das CSRF-Token der MFA-Seite und nicht das aus dem Signin-Formular", async () => {
    // Der im Code kommentierte Fehlerfall: mit dem alten Token scheitert der Schritt
    // mit einer Meldung, die nach „falscher Code" aussieht, obwohl der Code stimmt.
    const zustand = await offenerZustand();
    const { netz, aufrufe } = baueNetz();

    await beendeGarminLoginMitMfa(zustand, "123456", { netz });

    const post = aufrufe[0]!;
    expect(post.url).toContain("/sso/verifyMFA/loginEnterMfaCode");
    expect(post.felder.get("_csrf")).toBe(MFA_CSRF);
    expect(post.felder.get("_csrf")).not.toBe(SIGNIN_CSRF);
    expect(post.felder.get("mfa-code")).toBe("123456");
    expect(post.felder.get("fromPage")).toBe("setupEnterMfaCode");
    expect(post.headers.Cookie).toBe(
      "GARMIN-SSO=1; GARMIN-SSO-GUID=ABCDEF0123456789ABCDEF0123456789",
    );
    expect(post.headers.Referer).toBe(zustand.referer);
  });

  it("meldet einen falschen Code als Ablehnung mit eigener Meldung", async () => {
    const zustand = await offenerZustand();
    const { netz } = baueNetz({ mfaPost: () => html(MFA_ABGELEHNT_SEITE) });

    const fehler = await fangeLoginFehler(
      beendeGarminLoginMitMfa(zustand, "000000", { netz }),
    );

    expect(fehler.schritt).toBe("mfa-verify");
    expect(fehler.benutzerMeldung).toContain("Bestätigungscode abgelehnt");
  });

  it("unterscheidet auch hier den gebrochenen Pfad vom falschen Code", async () => {
    const zustand = await offenerZustand();
    const { netz } = baueNetz({ mfaPost: () => html(CLOUDFLARE_SEITE) });

    const fehler = await fangeLoginFehler(
      beendeGarminLoginMitMfa(zustand, "123456", { netz }),
    );

    expect(fehler.benutzerMeldung).toContain("antwortet gerade nicht wie erwartet");
  });
});

describe("starteGarminLogin — Fehlschläge", () => {
  it("nennt ein falsches Passwort beim Namen", async () => {
    const { netz, aufrufe } = baueNetz({ signinPost: () => html(ABGELEHNT_SEITE) });

    const fehler = await fangeLoginFehler(
      starteGarminLogin("athlet@example.com", "falsch", { netz }),
    );

    expect(fehler.schritt).toBe("signin-post");
    expect(fehler.benutzerMeldung).toContain("E-Mail-Adresse und Passwort");
    // Der Log bekommt den rohen Titel, die Oberfläche nicht.
    expect(fehler.message).toContain("GARMIN Authentication Application");
    // Ohne Ticket kein Tausch.
    expect(aufrufe).toHaveLength(3);
  });

  it("hält eine Cloudflare-Challenge für unlesbar und nicht für eine Ablehnung", async () => {
    // Die Unterscheidung ist das, was der Athlet zu lesen bekommt: Ihm sein korrektes
    // Passwort vorzuwerfen, während der Pfad blockiert ist, wäre die falsche Auskunft.
    const { netz } = baueNetz({ signinPost: () => html(CLOUDFLARE_SEITE) });

    const fehler = await fangeLoginFehler(
      starteGarminLogin("athlet@example.com", "geheim", { netz }),
    );

    expect(fehler.benutzerMeldung).toContain("antwortet gerade nicht wie erwartet");
    expect(fehler.benutzerMeldung).not.toContain("Passwort");
    expect(fehler.message).toContain("trägt nicht Garmins Login-Titel");
  });

  it("gibt beim Rate-Limit die Meldung mit Wiederholung statt eines Passwort-Verdachts", async () => {
    const { netz } = baueNetz({
      signinPost: () => html("<html><body>Too Many Requests</body></html>", 429),
    });

    const fehler = await fangeLoginFehler(
      starteGarminLogin("athlet@example.com", "geheim", { netz }),
    );

    expect(fehler.schritt).toBe("signin-post");
    expect(fehler.httpStatus).toBe(429);
    expect(fehler.benutzerMeldung).toContain("in einigen Minuten");
  });

  it("erkennt das Rate-Limit auch schon auf der Embed-Seite", async () => {
    const { netz, aufrufe } = baueNetz({ embed: () => html("", 429) });

    const fehler = await fangeLoginFehler(
      starteGarminLogin("athlet@example.com", "geheim", { netz }),
    );

    expect(fehler.schritt).toBe("embed");
    expect(fehler.benutzerMeldung).toContain("in einigen Minuten");
    expect(aufrufe).toHaveLength(1);
  });

  it("meldet eine Signin-Seite ohne CSRF-Token als unerreichbar", async () => {
    const { netz } = baueNetz({ signinGet: () => html(CLOUDFLARE_SEITE) });

    const fehler = await fangeLoginFehler(
      starteGarminLogin("athlet@example.com", "geheim", { netz }),
    );

    expect(fehler.schritt).toBe("signin-get");
    expect(fehler.benutzerMeldung).toContain("antwortet gerade nicht wie erwartet");
  });
});

describe("Ticket-Tausch über die client_id-Schleife", () => {
  it("nimmt die zweite client_id, wenn die erste nicht mehr trägt", async () => {
    // Garmin rotiert die IDs; genau dafür ist die Schleife da — der Athlet merkt nichts.
    const { netz, aufrufe } = baueNetz({
      diTausch: (clientId) =>
        clientId === ERSTE_CLIENT_ID
          ? json('{"error":"invalid_client"}', 400)
          : json(DI_TOKEN_ANTWORT),
    });

    const ergebnis = await starteGarminLogin("athlet@example.com", "geheim", { netz });

    expect(ergebnis).toMatchObject({
      art: "fertig",
      anmeldung: { di_client_id: ZWEITE_CLIENT_ID, di_token: DI_TOKEN },
    });
    const versuche = aufrufe.filter((a) => a.url.includes("diauth.garmin.com"));
    expect(versuche.map((a) => a.felder.get("client_id"))).toEqual([
      ERSTE_CLIENT_ID,
      ZWEITE_CLIENT_ID,
    ]);
  });

  it("überspringt auch eine 200er-Antwort ohne Token", async () => {
    const { netz } = baueNetz({
      diTausch: (clientId) =>
        clientId === ERSTE_CLIENT_ID
          ? json('{"access_token":"nur-die-haelfte"}')
          : json(DI_TOKEN_ANTWORT),
    });

    const ergebnis = await starteGarminLogin("athlet@example.com", "geheim", { netz });

    expect(ergebnis).toMatchObject({
      anmeldung: { di_client_id: ZWEITE_CLIENT_ID },
    });
  });

  it("scheitert erst, wenn alle vier IDs durch sind — und nennt sie im Log", async () => {
    const { netz, aufrufe } = baueNetz({
      diTausch: () => json('{"error":"invalid_client"}', 400),
    });

    const fehler = await fangeLoginFehler(
      starteGarminLogin("athlet@example.com", "geheim", { netz }),
    );

    expect(fehler.schritt).toBe("di-tausch");
    expect(fehler.benutzerMeldung).toContain("antwortet gerade nicht wie erwartet");
    expect(fehler.message).toContain("HTTP 400");
    expect(aufrufe.filter((a) => a.url.includes("diauth.garmin.com"))).toHaveLength(4);
  });
});

describe("Profilabruf", () => {
  it("scheitert lieber, als eine Anmeldung ohne displayName zurückzugeben", async () => {
    // Der Schlaf-Endpunkt trägt den displayName im Pfad — ohne ihn wäre die
    // gespeicherte Verbindung von Anfang an unbrauchbar.
    const { netz } = baueNetz({ profil: () => json('{"profileId":1234567}') });

    const fehler = await fangeLoginFehler(
      starteGarminLogin("athlet@example.com", "geheim", { netz }),
    );

    expect(fehler.schritt).toBe("profil");
    expect(fehler.message).toContain("ohne displayName");
  });
});

describe("Naht", () => {
  it("lässt die Aufrufer bei zwei Argumenten — der Default ist der echte Pfad", () => {
    // Die Routen in `web/` rufen unverändert mit zwei Argumenten auf; die Option ist
    // nur für Tests da. Hier steht das als Zusicherung an der Signatur.
    expect(starteGarminLogin).toHaveLength(2);
    expect(beendeGarminLoginMitMfa).toHaveLength(2);
  });
});
