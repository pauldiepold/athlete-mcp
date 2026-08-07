import { afterEach, describe, expect, it, vi } from "vitest";
import { FinalSurgeLoginFehler, login } from "./finalSurgeClient.js";

/**
 * Der Login unterscheidet **zwei** Fälle, und nur die Unterscheidung wird hier geprüft:
 * Was der Athlet tun soll, hängt daran. „Bitte prüf dein Passwort" auf einen Ausfall
 * bei Final Surge zu antworten, schickt ihn auf die Suche nach einem Fehler, den er
 * nicht hat — und ein stiller 500er sagt ihm gar nichts.
 */

function antworte(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("login", () => {
  it("liefert Session bei Erfolg", async () => {
    antworte(200, { success: true, data: { user_key: "k", token: "t" } });

    await expect(login("a@b.de", "pw")).resolves.toEqual({
      userKey: "k",
      token: "t",
    });
  });

  // Der Normalfall bei falschem Passwort: HTTP 200, success=false.
  it("zählt eine abgelehnte Anmeldung zu den Zugangsdaten", async () => {
    antworte(200, { success: false, error_description: "Invalid login" });

    await expect(login("a@b.de", "falsch")).rejects.toMatchObject({
      grund: "zugangsdaten",
    });
  });

  it("zählt 401 zu den Zugangsdaten", async () => {
    antworte(401, { success: false });

    await expect(login("a@b.de", "falsch")).rejects.toMatchObject({
      grund: "zugangsdaten",
    });
  });

  it("zählt einen Serverfehler nicht zu den Zugangsdaten", async () => {
    antworte(503, "<html>maintenance</html>");

    await expect(login("a@b.de", "pw")).rejects.toMatchObject({
      grund: "nicht_erreichbar",
    });
  });

  it("zählt ein Rate-Limit nicht zu den Zugangsdaten", async () => {
    antworte(429, { success: false });

    await expect(login("a@b.de", "pw")).rejects.toMatchObject({
      grund: "nicht_erreichbar",
    });
  });

  it("zählt eine angenommene Antwort ohne Token nicht zu den Zugangsdaten", async () => {
    antworte(200, { success: true, data: {} });

    await expect(login("a@b.de", "pw")).rejects.toMatchObject({
      grund: "nicht_erreichbar",
    });
  });

  it("zählt ein totes Netz nicht zu den Zugangsdaten", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(login("a@b.de", "pw")).rejects.toMatchObject({
      grund: "nicht_erreichbar",
    });
  });

  // Die beiden Meldungen sind getrennt: die rohe fürs Log, die andere für die Fläche.
  it("hält die rohe Meldung aus der Benutzermeldung heraus", async () => {
    antworte(500, { success: false, error_description: "db down" });

    const fehler = await login("a@b.de", "pw").catch((e: unknown) => e);

    expect(fehler).toBeInstanceOf(FinalSurgeLoginFehler);
    const f = fehler as FinalSurgeLoginFehler;
    expect(f.message).toContain("500");
    expect(f.benutzerMeldung).not.toContain("500");
    expect(f.benutzerMeldung).toMatch(/Final Surge/);
  });
});
