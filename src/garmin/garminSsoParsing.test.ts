import { describe, it, expect } from "vitest";

import {
  deuteLoginAntwort,
  deuteMfaAntwort,
  extrahiereCsrf,
  extrahiereTicket,
  extrahiereTitel,
} from "./garminSsoParsing.js";
import {
  ABGELEHNT_SEITE,
  CLOUDFLARE_SEITE,
  ERFOLG_SEITE,
  ERFOLG_TICKET,
  GESPERRT_SEITE,
  MFA_ABGELEHNT_SEITE,
  MFA_CSRF,
  MFA_SEITE,
  SIGNIN_SEITE,
} from "./fixtures/ssoAntworten.js";

/**
 * Der Teil des Garmin-Logins, der brechen wird — deshalb steht er gegen gespeicherte
 * Antwort-Schnipsel unter Test (Auflage aus Spike #38: der Pfad ist inoffiziell).
 * Ändert Garmin sein Formular, wird hier etwas rot, bevor ein Athlet vor einer
 * weißen Seite steht.
 */
describe("extrahiereCsrf", () => {
  it("findet das Token der Signin-Seite zwischen anderen value-Attributen", () => {
    expect(extrahiereCsrf(SIGNIN_SEITE)).toBe("3F8A21C4-CSRF-SIGNIN");
  });

  it("findet das frische Token der MFA-Seite", () => {
    expect(extrahiereCsrf(MFA_SEITE)).toBe(MFA_CSRF);
  });

  it("liefert null, wenn kein Formular da ist", () => {
    expect(extrahiereCsrf(CLOUDFLARE_SEITE)).toBeNull();
  });
});

describe("extrahiereTicket", () => {
  it("findet das Service-Ticket in der Erfolgsseite", () => {
    expect(extrahiereTicket(ERFOLG_SEITE)).toBe(ERFOLG_TICKET);
  });

  it("liefert null, wo keins steht", () => {
    expect(extrahiereTicket(MFA_SEITE)).toBeNull();
  });
});

describe("extrahiereTitel", () => {
  it("liest Garmins einziges Statussignal", () => {
    expect(extrahiereTitel(ERFOLG_SEITE)).toBe("Success");
  });

  it("liefert einen leeren Titel statt zu werfen, wenn keiner da ist", () => {
    expect(extrahiereTitel("<html><body>nichts</body></html>")).toBe("");
  });
});

describe("deuteLoginAntwort", () => {
  it("erkennt den geglückten Login samt Ticket", () => {
    expect(deuteLoginAntwort(ERFOLG_SEITE)).toEqual({
      art: "erfolg",
      ticket: ERFOLG_TICKET,
    });
  });

  it("erkennt die MFA-Aufforderung und nimmt das frische CSRF-Token mit", () => {
    // Das Token der Signin-Seite gilt ab hier nicht mehr — nähme der zweite Schritt
    // das alte, sähe der Fehlschlag nach „falscher Code" aus, obwohl der Code stimmt.
    expect(deuteLoginAntwort(MFA_SEITE)).toEqual({ art: "mfa", csrf: MFA_CSRF });
    expect(MFA_CSRF).not.toBe(extrahiereCsrf(SIGNIN_SEITE));
  });

  it("erkennt falsche Zugangsdaten als Ablehnung", () => {
    expect(deuteLoginAntwort(ABGELEHNT_SEITE)).toEqual({
      art: "abgelehnt",
      titel: "GARMIN Authentication Application",
    });
  });

  it("erkennt ein gesperrtes Konto als Ablehnung mit eigenem Titel", () => {
    expect(deuteLoginAntwort(GESPERRT_SEITE)).toMatchObject({ art: "abgelehnt" });
    expect(extrahiereTitel(GESPERRT_SEITE)).toContain("Locked");
  });

  it("nennt eine Cloudflare-Zwischenseite unlesbar und nicht abgelehnt", () => {
    // Der Unterschied ist das, was der Athlet zu lesen bekommt: „prüf dein Passwort"
    // wäre hier falsch — es stimmt ja. Blockiert ist der Pfad, nicht die Anmeldung.
    expect(deuteLoginAntwort(CLOUDFLARE_SEITE)).toMatchObject({ art: "unlesbar" });
  });

  it("hält jede fremde Seite für unlesbar statt für eine Ablehnung", () => {
    const wartung = "<html><head><title>Service unavailable</title></head></html>";

    expect(deuteLoginAntwort(wartung).art).toBe("unlesbar");
    expect(deuteLoginAntwort("").art).toBe("unlesbar");
  });

  it("meldet eine Erfolgsseite ohne Ticket als unlesbar, nicht als Erfolg", () => {
    const ohneTicket = "<html><head><title>Success</title></head><body></body></html>";

    expect(deuteLoginAntwort(ohneTicket)).toEqual({
      art: "unlesbar",
      titel: "Success",
      grund: "Erfolgsseite ohne Service-Ticket",
    });
  });

  it("meldet eine MFA-Seite ohne CSRF-Token als unlesbar", () => {
    const ohneCsrf = "<html><head><title>Garmin - MFA</title></head><body></body></html>";

    expect(deuteLoginAntwort(ohneCsrf)).toMatchObject({
      art: "unlesbar",
      grund: "MFA-Seite ohne _csrf-Token",
    });
  });
});

describe("deuteMfaAntwort", () => {
  it("erkennt den geglückten zweiten Schritt samt Ticket", () => {
    expect(deuteMfaAntwort(ERFOLG_SEITE)).toEqual({
      art: "erfolg",
      ticket: ERFOLG_TICKET,
    });
  });

  it("erkennt einen falschen Code als Ablehnung — und nicht als neue MFA-Runde", () => {
    // Die abgelehnte MFA-Seite trägt wieder „MFA" im Titel. Ohne eigenen Deuter
    // liefe der Athlet in eine Schleife aus MFA-Handles, statt eine Meldung zu sehen.
    expect(deuteMfaAntwort(MFA_ABGELEHNT_SEITE).art).toBe("abgelehnt");
  });

  it("unterscheidet auch hier den gebrochenen Pfad vom falschen Code", () => {
    expect(deuteMfaAntwort(CLOUDFLARE_SEITE).art).toBe("unlesbar");
  });
});
