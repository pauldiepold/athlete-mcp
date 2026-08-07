import { describe, it, expect } from "vitest";

import {
  beobachte,
  FEHLER_MELDUNG,
  istVerbunden,
  leseVerbindungen,
  meldeErfolg,
  meldeFehler,
  speichereFinalSurge,
  speichereGarmin,
  verbindungsZustand,
} from "./verbindungen.js";

/**
 * Ein Fake-KV über einer Map, mit `list`-Pagination — dieselbe Bauart wie im
 * Cron-Test.
 *
 * `list` bleibt drin, obwohl `leseVerbindungen` es nicht mehr benutzt: Genau das ist
 * hier zu prüfen (siehe „ohne `kv.list`"), und der echte Index hinkt einem frischen
 * `put` hinterher.
 */
function fakeKv(inhalt: Record<string, string> = {}, seitengroesse = 1000) {
  const daten = new Map(Object.entries(inhalt));
  const kv = {
    async get(key: string) {
      return daten.get(key) ?? null;
    },
    async put(key: string, value: string) {
      daten.set(key, value);
    },
    async delete(key: string) {
      daten.delete(key);
    },
    async list({ prefix = "", cursor }: { prefix?: string; cursor?: string } = {}) {
      const passend = [...daten.keys()].filter((n) => n.startsWith(prefix)).sort();
      const ab = cursor ? Number(cursor) : 0;
      const seite = passend.slice(ab, ab + seitengroesse);
      const bis = ab + seite.length;
      return {
        keys: seite.map((name) => ({ name })),
        list_complete: bis >= passend.length,
        cursor: String(bis),
      };
    },
  };
  return { kv: kv as unknown as KVNamespace, daten };
}

/** Nur die Aussage, auf die es ankommt — der Rest der Verbindung ist Anzeige-Material. */
function zustaende(verbindungen: { quelle: string; zustand: string }[]) {
  return Object.fromEntries(verbindungen.map((v) => [v.quelle, v.zustand]));
}

describe("verbindungsZustand", () => {
  it("meldet beide Quellen als fehlend, wenn nichts verbunden ist", () => {
    expect(zustaende(verbindungsZustand("paul", []))).toEqual({
      finalsurge: "fehlt",
      garmin: "fehlt",
    });
  });

  it("meldet nur Garmin als verbunden, wenn nur Garmin eingerichtet ist", () => {
    const keys = ["user:paul:garmin", "user:paul:garmin:profile"];

    expect(zustaende(verbindungsZustand("paul", keys))).toEqual({
      finalsurge: "fehlt",
      garmin: "verbunden",
    });
  });

  it("hält den Session-Cache nicht für eine Final-Surge-Verbindung", () => {
    // `user:paul:finalsurge:session` beginnt mit dem Verbindungs-Key; ein
    // Präfix-Vergleich hätte hier „verbunden" gemeldet, ohne dass je Zugangsdaten
    // hinterlegt wurden.
    const keys = ["user:paul:finalsurge:session"];

    expect(zustaende(verbindungsZustand("paul", keys)).finalsurge).toBe("fehlt");
  });

  it("liest keine fremden Einträge als eigene Verbindung", () => {
    const keys = ["user:jonas:garmin", "user:jonas:finalsurge"];

    expect(zustaende(verbindungsZustand("paul", keys))).toEqual({
      finalsurge: "fehlt",
      garmin: "fehlt",
    });
  });

  it("macht aus einer verbundenen Quelle mit Marker eine kaputte", () => {
    const verbindungen = verbindungsZustand("paul", ["user:paul:garmin"], {
      garmin: { meldung: "Garmin hat die Anmeldung abgelehnt.", seit: "2026-08-06T05:00:00Z" },
    });

    expect(zustaende(verbindungen).garmin).toBe("kaputt");
    expect(verbindungen.find((v) => v.quelle === "garmin")).toMatchObject({
      meldung: "Garmin hat die Anmeldung abgelehnt.",
      seit: "2026-08-06T05:00:00Z",
    });
  });

  it("ignoriert einen Marker ohne Eintrag — nicht eingerichtet ist nicht kaputt", () => {
    const verbindungen = verbindungsZustand("paul", [], {
      garmin: { meldung: "irgendwas von früher", seit: "2026-01-01T00:00:00Z" },
    });

    expect(zustaende(verbindungen).garmin).toBe("fehlt");
    expect(verbindungen.find((v) => v.quelle === "garmin")?.meldung).toBeNull();
  });

  it("liefert die Quellen in stabiler Reihenfolge, jede genau einmal", () => {
    expect(verbindungsZustand("paul", []).map((v) => v.quelle)).toEqual([
      "finalsurge",
      "garmin",
    ]);
  });
});

describe("leseVerbindungen", () => {
  it("setzt Einträge und Marker aus dem KV zusammen", async () => {
    const { kv } = fakeKv({
      "user:paul:finalsurge": "{}",
      "user:paul:garmin": "{}",
      "user:paul:garmin:fehler": JSON.stringify({
        meldung: "Garmin antwortet nicht mehr.",
        seit: "2026-08-06T05:00:00Z",
      }),
    });

    expect(zustaende(await leseVerbindungen(kv, "paul"))).toEqual({
      finalsurge: "verbunden",
      garmin: "kaputt",
    });
  });

  it("übersteht einen unlesbaren Marker, statt den Zustand zu kippen", async () => {
    const { kv } = fakeKv({
      "user:paul:garmin": "{}",
      "user:paul:garmin:fehler": "kein JSON",
    });

    expect(zustaende(await leseVerbindungen(kv, "paul")).garmin).toBe("verbunden");
  });

  it("meldet eine gerade geschriebene Verbindung, auch wenn kv.list sie noch nicht kennt", async () => {
    // Der Listen-Index ist *eventually consistent*: Nach `speichereFinalSurge` steht
    // der Eintrag da, im Index aber noch nicht. Genau in dieser Sekunde fragt die
    // Oberfläche nach — und zeigte den Schritt sonst bis zum Neuladen als offen.
    const { kv } = fakeKv({ "user:paul:garmin": "{}" });
    const kvMitHinkendemIndex = {
      ...kv,
      list: async () => ({ keys: [], list_complete: true, cursor: "0" }),
    } as unknown as KVNamespace;

    await speichereFinalSurge(kvMitHinkendemIndex, "paul", {
      email: "paul@example.com",
      password: "geheim",
    });

    expect(zustaende(await leseVerbindungen(kvMitHinkendemIndex, "paul"))).toEqual({
      finalsurge: "verbunden",
      garmin: "verbunden",
    });
  });
});

describe("istVerbunden", () => {
  it("erkennt eine eingerichtete Quelle und eine fehlende", async () => {
    const { kv } = fakeKv({ "user:paul:garmin": "{}" });

    expect(await istVerbunden(kv, "paul", "garmin")).toBe(true);
    expect(await istVerbunden(kv, "paul", "finalsurge")).toBe(false);
  });

  it("bleibt trotz Fehler-Marker verbunden — benutzt wird sie trotzdem", async () => {
    const { kv } = fakeKv({ "user:paul:garmin": "{}" });
    await meldeFehler(kv, "paul", "garmin", "kaputt");

    expect(await istVerbunden(kv, "paul", "garmin")).toBe(true);
  });
});

describe("beobachte", () => {
  it("löscht den Marker nach einem geglückten Aufruf", async () => {
    const { kv, daten } = fakeKv({ "user:paul:garmin": "{}" });
    await meldeFehler(kv, "paul", "garmin", "von gestern");

    const ergebnis = await beobachte(kv, "paul", "garmin", async () => 42);

    expect(ergebnis).toBe(42);
    expect(daten.has("user:paul:garmin:fehler")).toBe(false);
  });

  it("setzt den Marker bei einem gescheiterten Aufruf und lässt den Fehler weiterfliegen", async () => {
    const { kv, daten } = fakeKv({ "user:paul:garmin": "{}" });

    await expect(
      beobachte(kv, "paul", "garmin", async () => {
        throw new Error("Kein Garmin-Token-Bündel im KV: user:paul:garmin");
      }),
    ).rejects.toThrow("Kein Garmin-Token-Bündel");

    const marker = JSON.parse(daten.get("user:paul:garmin:fehler")!);
    expect(marker.meldung).toBe(FEHLER_MELDUNG.garmin);
    expect(marker.seit).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("trägt die rohe Fehlermeldung nicht in den Marker — der wird angezeigt", async () => {
    const { kv, daten } = fakeKv({ "user:paul:finalsurge": "{}" });

    await expect(
      beobachte(kv, "paul", "finalsurge", async () => {
        throw new Error("Keine Final-Surge-Creds im KV: user:paul:finalsurge");
      }),
    ).rejects.toThrow();

    expect(daten.get("user:paul:finalsurge:fehler")).not.toContain("user:paul");
  });

  it("meldet Erfolg, ohne dass vorher ein Marker lag", async () => {
    const { kv, daten } = fakeKv({ "user:paul:garmin": "{}" });

    await beobachte(kv, "paul", "garmin", async () => "ok");

    expect(daten.has("user:paul:garmin:fehler")).toBe(false);
  });
});

describe("meldeErfolg", () => {
  it("löscht einen gesetzten Marker", async () => {
    const { kv, daten } = fakeKv({ "user:paul:garmin": "{}" });
    await meldeFehler(kv, "paul", "garmin", "kaputt");

    await meldeErfolg(kv, "paul", "garmin");

    expect(daten.has("user:paul:garmin:fehler")).toBe(false);
  });
});

describe("speichereFinalSurge", () => {
  it("legt die Zugangsdaten ab und wirft die gecachte Session weg", async () => {
    const { kv, daten } = fakeKv({ "user:paul:finalsurge:session": "{alt}" });
    await meldeFehler(kv, "paul", "finalsurge", "altes Passwort");

    await speichereFinalSurge(kv, "paul", { email: "a@b.de", password: "geheim" });

    expect(JSON.parse(daten.get("user:paul:finalsurge")!)).toEqual({
      email: "a@b.de",
      password: "geheim",
    });
    expect(daten.has("user:paul:finalsurge:session")).toBe(false);
    expect(daten.has("user:paul:finalsurge:fehler")).toBe(false);
  });
});

describe("speichereGarmin", () => {
  it("legt ausschließlich das DI-Bündel und den displayName ab", async () => {
    const { kv, daten } = fakeKv();

    await speichereGarmin(kv, "paul", {
      di_token: "t",
      di_refresh_token: "r",
      di_client_id: "c",
      display_name: "paul-garmin",
    });

    expect(JSON.parse(daten.get("user:paul:garmin")!)).toEqual({
      di_token: "t",
      di_refresh_token: "r",
      di_client_id: "c",
    });
    expect(JSON.parse(daten.get("user:paul:garmin:profile")!)).toEqual({
      display_name: "paul-garmin",
    });
  });

  it("trägt kein durchgereichtes Feld mit ins Bündel — Auflage aus Spike #38", async () => {
    const { kv, daten } = fakeKv();

    await speichereGarmin(kv, "paul", {
      di_token: "t",
      di_refresh_token: "r",
      di_client_id: "c",
      display_name: "paul-garmin",
      // Ein Aufrufer, der versehentlich mehr durchreicht, als das Bündel kennt.
      password: "darf-nie-im-kv-landen",
    } as never);

    expect(daten.get("user:paul:garmin")).not.toContain("darf-nie-im-kv-landen");
    expect(daten.get("user:paul:garmin:profile")).not.toContain("darf-nie-im-kv-landen");
  });
});
