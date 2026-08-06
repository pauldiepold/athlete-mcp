import { describe, it, expect } from "vitest";
import {
  createInvite,
  einloesenInvite,
  getProfil,
  listInvites,
  listKonten,
  generateUserId,
  aktualisiereProfilBeimLogin,
  resolveIdentitaet,
} from "./identitaet.js";

/**
 * Fake-KV über einer Map — wie in seeding.test.ts/operatorDirectory.test.ts, hier aber
 * zusätzlich schreibend (`put`/`delete`), weil das Einlösen ein Schreibvorgang ist.
 * `expirationTtl` wird bewusst ignoriert: dass abgelaufene Codes verschwinden, ist eine
 * Zusage von KV; der Testwert liegt darin, dass „weg" und „unbekannt" derselbe Fall sind.
 */
function fakeKv(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries));
  const kv = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list({ prefix = "" }: { prefix?: string } = {}) {
      const keys = [...store.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
  return { kv, store };
}

describe("resolveIdentitaet", () => {
  it("löst eine bekannte Identität auf ihr Konto auf", async () => {
    const { kv } = fakeKv({ "google:sub-paul": "paul" });

    expect(await resolveIdentitaet(kv, "google", "sub-paul")).toBe("paul");
  });

  it("liefert für eine unbekannte Identität kein Konto", async () => {
    const { kv } = fakeKv({ "google:sub-paul": "paul" });

    expect(await resolveIdentitaet(kv, "google", "sub-fremd")).toBeNull();
    expect(await resolveIdentitaet(kv, "google", "")).toBeNull();
  });

  it("trennt die Verfahren: derselbe sub unter google und apple sind zwei Identitäten", async () => {
    const { kv } = fakeKv({
      "google:0815": "paul",
      "apple:0815": "jonas",
    });

    expect(await resolveIdentitaet(kv, "google", "0815")).toBe("paul");
    expect(await resolveIdentitaet(kv, "apple", "0815")).toBe("jonas");
  });

  it("löst nicht über ein anderes Verfahren auf, wenn dort nichts steht", async () => {
    const { kv } = fakeKv({ "google:0815": "paul" });

    expect(await resolveIdentitaet(kv, "apple", "0815")).toBeNull();
  });

  it("zieht das Profil niemals zur Auflösung heran", async () => {
    // Ein Profil, das auf diese Identität zeigt, aber kein Identitäts-Mapping:
    // die Anmeldung muss trotzdem ins Leere laufen.
    const { kv } = fakeKv({
      "user:paul:profile": JSON.stringify({
        anzeigename: "Paul",
        email: "paul@example.com",
        provider: "google",
        sub: "sub-paul",
      }),
    });

    expect(await resolveIdentitaet(kv, "google", "sub-paul")).toBeNull();
  });
});

describe("einloesenInvite – freier Code", () => {
  it("legt ein neues Konto mit generierter, opaker userId an", async () => {
    const { kv } = fakeKv();
    const { code } = await createInvite(kv);

    const ergebnis = await einloesenInvite(kv, {
      code,
      provider: "google",
      sub: "sub-neu",
      anzeigename: "Neue Athletin",
      email: "neu@example.com",
    });

    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    expect(ergebnis.userId).not.toBe("");
    // Das Token-Format des OAuth-Providers ist `userId:grantId:secret`.
    expect(ergebnis.userId).not.toContain(":");
    expect(await resolveIdentitaet(kv, "google", "sub-neu")).toBe(ergebnis.userId);
  });

  it("schreibt das Profil mit dem übergebenen Anzeigenamen", async () => {
    const { kv } = fakeKv();
    const { code } = await createInvite(kv);

    const ergebnis = await einloesenInvite(kv, {
      code,
      provider: "apple",
      sub: "sub-apple",
      anzeigename: "  Jonas  ",
      email: "jonas@privaterelay.appleid.com",
    });

    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    expect(await getProfil(kv, ergebnis.userId)).toEqual({
      anzeigename: "Jonas",
      email: "jonas@privaterelay.appleid.com",
      provider: "apple",
      sub: "sub-apple",
    });
  });

  it("legt das Konto auch ohne Anzeigenamen an (Apple liefert ihn nicht immer)", async () => {
    const { kv } = fakeKv();
    const { code } = await createInvite(kv);

    const ergebnis = await einloesenInvite(kv, {
      code,
      provider: "apple",
      sub: "sub-namenlos",
    });

    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    expect((await getProfil(kv, ergebnis.userId))?.anzeigename).toBe("");
    expect(await resolveIdentitaet(kv, "apple", "sub-namenlos")).toBe(ergebnis.userId);
  });

  it("entwertet den Code: ein zweites Einlösen wird abgewiesen", async () => {
    const { kv } = fakeKv();
    const { code } = await createInvite(kv);

    await einloesenInvite(kv, { code, provider: "google", sub: "sub-erst" });
    const zweitens = await einloesenInvite(kv, {
      code,
      provider: "google",
      sub: "sub-zweit",
    });

    expect(zweitens).toEqual({ ok: false, fehler: "unbekannt" });
    expect(await resolveIdentitaet(kv, "google", "sub-zweit")).toBeNull();
    expect(await listInvites(kv)).toEqual([]);
  });
});

describe("einloesenInvite – kontogebundener Code (Verfahrenswechsel)", () => {
  it("hängt die Identität an genau dieses Konto und lässt die userId unberührt", async () => {
    const { kv } = fakeKv();
    const { code } = await createInvite(kv, "paul");

    const ergebnis = await einloesenInvite(kv, {
      code,
      provider: "google",
      sub: "sub-paul",
      anzeigename: "Paul",
    });

    expect(ergebnis).toMatchObject({ ok: true, userId: "paul" });
    expect(await resolveIdentitaet(kv, "google", "sub-paul")).toBe("paul");
  });

  it("ersetzt die bisherige Identität des Kontos", async () => {
    const { kv } = fakeKv({ "google:sub-alt": "paul" });
    const { code } = await createInvite(kv, "paul");

    await einloesenInvite(kv, { code, provider: "apple", sub: "sub-neu" });

    expect(await resolveIdentitaet(kv, "apple", "sub-neu")).toBe("paul");
    expect(await resolveIdentitaet(kv, "google", "sub-alt")).toBeNull();
  });

  it("räumt beim Wechsel auch eine hängengebliebene zweite Identität weg", async () => {
    // Der Abbruch-Zustand aus „erst neu schreiben, dann alt löschen": zwei Mappings
    // auf dasselbe Konto. Das nächste Einlösen heilt ihn.
    const { kv } = fakeKv({ "google:sub-a": "paul", "apple:sub-b": "paul" });
    const { code } = await createInvite(kv, "paul");

    await einloesenInvite(kv, { code, provider: "google", sub: "sub-c" });

    expect(await resolveIdentitaet(kv, "google", "sub-c")).toBe("paul");
    expect(await resolveIdentitaet(kv, "google", "sub-a")).toBeNull();
    expect(await resolveIdentitaet(kv, "apple", "sub-b")).toBeNull();
  });

  it("lässt die Fachdaten-Schlüssel des Kontos unberührt", async () => {
    const { kv, store } = fakeKv({
      "google:sub-alt": "paul",
      "user:paul:garmin": '{"di_token":"…"}',
      "user:paul:finalsurge": '{"email":"…"}',
    });
    const { code } = await createInvite(kv, "paul");

    await einloesenInvite(kv, { code, provider: "apple", sub: "sub-neu" });

    expect(store.get("user:paul:garmin")).toBe('{"di_token":"…"}');
    expect(store.get("user:paul:finalsurge")).toBe('{"email":"…"}');
  });

  it("entwertet beim Einlösen die übrigen offenen Codes desselben Kontos", async () => {
    const { kv } = fakeKv();
    const { code } = await createInvite(kv, "paul");
    await createInvite(kv, "paul");
    const fremder = await createInvite(kv, "jonas");

    await einloesenInvite(kv, { code, provider: "google", sub: "sub-paul" });

    expect(await listInvites(kv)).toEqual([{ code: fremder.code, userId: "jonas" }]);
  });
});

describe("einloesenInvite – Abweisung", () => {
  it("weist einen unbekannten Code ab, ohne ein Mapping zu hinterlassen", async () => {
    const { kv } = fakeKv();

    const ergebnis = await einloesenInvite(kv, {
      code: "gibt-es-nicht",
      provider: "google",
      sub: "sub-neu",
    });

    expect(ergebnis).toEqual({ ok: false, fehler: "unbekannt" });
    expect(await resolveIdentitaet(kv, "google", "sub-neu")).toBeNull();
  });

  it("weist einen leeren Code ab", async () => {
    const { kv } = fakeKv();

    expect(
      await einloesenInvite(kv, { code: "", provider: "google", sub: "sub-neu" }),
    ).toEqual({ ok: false, fehler: "unbekannt" });
  });

  it("legt ohne Identität kein Konto an", async () => {
    const { kv } = fakeKv();
    const { code } = await createInvite(kv);

    expect(
      await einloesenInvite(kv, { code, provider: "google", sub: "" }),
    ).toEqual({ ok: false, fehler: "unbekannt" });
    expect(await listInvites(kv)).toHaveLength(1);
  });
});

describe("E-Mail-Adresse ist Attribut, nie Identifier", () => {
  it("lässt zwei Konten mit derselben Adresse unter verschiedenen Verfahren zwei Konten bleiben", async () => {
    const { kv } = fakeKv();
    const a = await createInvite(kv);
    const b = await createInvite(kv);

    const google = await einloesenInvite(kv, {
      code: a.code,
      provider: "google",
      sub: "sub-google",
      email: "gleich@example.com",
    });
    const apple = await einloesenInvite(kv, {
      code: b.code,
      provider: "apple",
      sub: "sub-apple",
      email: "gleich@example.com",
    });

    expect(google.ok && apple.ok).toBe(true);
    if (!google.ok || !apple.ok) return;
    expect(google.userId).not.toBe(apple.userId);
    expect(await resolveIdentitaet(kv, "google", "sub-google")).toBe(google.userId);
    expect(await resolveIdentitaet(kv, "apple", "sub-apple")).toBe(apple.userId);
  });
});

describe("aktualisiereProfilBeimLogin", () => {
  it("frischt die Adresse auf und lässt den Anzeigenamen stehen", async () => {
    const { kv } = fakeKv();
    const { code } = await createInvite(kv, "paul");
    await einloesenInvite(kv, {
      code,
      provider: "google",
      sub: "sub-paul",
      anzeigename: "Paul",
      email: "alt@example.com",
    });

    await aktualisiereProfilBeimLogin(kv, "paul", "google", "sub-paul", "neu@example.com");

    expect(await getProfil(kv, "paul")).toEqual({
      anzeigename: "Paul",
      email: "neu@example.com",
      provider: "google",
      sub: "sub-paul",
    });
  });

  it("überschreibt ein unlesbares Profil nicht", async () => {
    // Sonst ersetzt ein einziger Login den vielleicht noch rettbaren Anzeigenamen
    // durch einen leeren — und Apple liefert ihn nie wieder.
    const { kv, store } = fakeKv({
      "google:sub-paul": "paul",
      "user:paul:profile": "{kaputt",
    });

    const profil = await aktualisiereProfilBeimLogin(
      kv,
      "paul",
      "google",
      "sub-paul",
      "neu@example.com",
    );

    expect(store.get("user:paul:profile")).toBe("{kaputt");
    // Für die Session steht trotzdem ein brauchbares Profil zur Verfügung.
    expect(profil.email).toBe("neu@example.com");
  });

  it("behält die bekannte Adresse, wenn der Provider keine mitschickt", async () => {
    const { kv } = fakeKv();
    const { code } = await createInvite(kv, "paul");
    await einloesenInvite(kv, {
      code,
      provider: "apple",
      sub: "sub-paul",
      anzeigename: "Paul",
      email: "paul@example.com",
    });

    await aktualisiereProfilBeimLogin(kv, "paul", "apple", "sub-paul", undefined);

    expect((await getProfil(kv, "paul"))?.email).toBe("paul@example.com")
  });
});

describe("Operator-Sicht", () => {
  it("listet offene Codes mit ihrer Sorte", async () => {
    const { kv } = fakeKv();
    const frei = await createInvite(kv);
    const gebunden = await createInvite(kv, "paul");

    const offen = await listInvites(kv);

    expect(offen).toHaveLength(2);
    expect(offen).toContainEqual({ code: frei.code });
    expect(offen).toContainEqual({ code: gebunden.code, userId: "paul" });
  });

  it("listet die Konten, die eine Identität haben, samt Profil", async () => {
    const { kv } = fakeKv();
    const a = await createInvite(kv, "paul");
    await einloesenInvite(kv, {
      code: a.code,
      provider: "google",
      sub: "sub-paul",
      anzeigename: "Paul",
      email: "paul@example.com",
    });

    expect(await listKonten(kv)).toEqual([
      {
        userId: "paul",
        profil: {
          anzeigename: "Paul",
          email: "paul@example.com",
          provider: "google",
          sub: "sub-paul",
        },
      },
    ]);
  });

  it("zählt ein Konto nach dem Verfahrenswechsel nur einmal", async () => {
    const { kv } = fakeKv({ "google:sub-alt": "paul" });
    const { code } = await createInvite(kv, "paul");
    await einloesenInvite(kv, { code, provider: "apple", sub: "sub-neu" });

    const konten = await listKonten(kv);

    expect(konten).toHaveLength(1);
    expect(konten[0]!.profil?.provider).toBe("apple");
  });
});

describe("generateUserId", () => {
  it("enthält kein ':' — das Token-Format des OAuth-Providers verlangt es", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateUserId()).not.toContain(":");
    }
  });

  it("ist bei jedem Aufruf verschieden", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateUserId()));
    expect(ids.size).toBe(50);
  });
});
