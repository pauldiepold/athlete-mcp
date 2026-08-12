import { describe, expect, it, vi } from "vitest";

import type { Koerperdaten } from "./formatKoerperdaten.js";
import type { GarminClient } from "./garminClient.js";
import { holeKoerperdatenTage } from "./koerperdatenHolLauf.js";

/**
 * Der Hol-Lauf ist die Schleife, die Cron und Erstbefüllung gemeinsam haben (Issue
 * #55). Beide Aufrufer haben ihre eigenen Tests; hier steht das, was **nur** dem
 * gemeinsamen Stück gehört — allen voran die asymmetrische Marker-Regel, deren
 * Verdopplung der Anlass für dieses Modul war.
 */

const MARKER = "user:paul:garmin:fehler";
const client = {} as GarminClient;
const stilleLogs = { log: () => {}, logFehler: () => {} };

/** Fake-KV, das nur festhält, was geschrieben und gelöscht wurde. */
function fakeKv() {
  const inhalt = new Map<string, string>();
  const kv = {
    async get(key: string) {
      return inhalt.get(key) ?? null;
    },
    async put(key: string, wert: string) {
      inhalt.set(key, wert);
    },
    async delete(key: string) {
      inhalt.delete(key);
    },
  };
  return Object.assign(kv as unknown as KVNamespace, { inhalt });
}

/** Eine leere, aber formgültige Körperdaten-Zeile. */
function tag(date: string): Koerperdaten {
  return {
    date,
    hrv: null,
    sleep: null,
    stress: null,
    body_battery: null,
    training_readiness: null,
    skin_temp: null,
  };
}

/** Archiv, das mitschreibt, welche Tage upsertet wurden. */
function fakeArchiv() {
  const geschrieben: string[] = [];
  return {
    archiv: {
      async upsert(_userId: string, date: string) {
        geschrieben.push(date);
      },
    },
    geschrieben,
  };
}

function lauf(overrides: Partial<Parameters<typeof holeKoerperdatenTage>[0]> = {}) {
  const { archiv } = fakeArchiv();
  return holeKoerperdatenTage({
    kv: fakeKv(),
    archiv,
    userId: "paul",
    tage: [],
    etikett: "Testlauf",
    buildClient: async () => client,
    fetchLive: async (_c, date) => tag(date),
    warte: async () => {},
    ...stilleLogs,
    ...overrides,
  });
}

describe("holeKoerperdatenTage", () => {
  it("holt die übergebenen Tage der Reihe nach und bilanziert sie", async () => {
    const { archiv, geschrieben } = fakeArchiv();

    const bilanz = await lauf({
      archiv,
      tage: ["2026-03-01", "2026-03-02", "2026-03-03"],
    });

    expect(geschrieben).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"]);
    expect(bilanz).toEqual({ offen: 3, geschrieben: 3, gescheitert: [] });
  });

  it("sammelt gescheiterte Tage, statt den Lauf abzubrechen", async () => {
    const { archiv, geschrieben } = fakeArchiv();

    const bilanz = await lauf({
      archiv,
      tage: ["2026-03-01", "2026-03-02", "2026-03-03"],
      fetchLive: async (_c, date) => {
        if (date === "2026-03-02") throw new Error("Garmin 500");
        return tag(date);
      },
    });

    expect(bilanz).toEqual({
      offen: 3,
      geschrieben: 2,
      gescheitert: ["2026-03-02"],
    });
    expect(geschrieben).toEqual(["2026-03-01", "2026-03-03"]);
  });

  it("wirft, wenn der Client gar nicht erst entsteht", async () => {
    // Kein Tag, der scheitert, sondern ein Lauf, der nicht stattfindet — die
    // Aufrufer hinterlassen dafür verschiedene Spuren und brauchen den Fehler.
    await expect(
      lauf({
        tage: ["2026-03-01"],
        buildClient: async () => {
          throw new Error("Refresh-Token ungültig");
        },
      }),
    ).rejects.toThrow("Refresh-Token ungültig");
  });

  it("pausiert zwischen den Tagen, aber nicht vor dem ersten", async () => {
    const pausen: number[] = [];

    await lauf({
      tage: ["2026-03-01", "2026-03-02", "2026-03-03"],
      pauseMs: 1000,
      warte: async (ms) => {
        pausen.push(ms);
      },
    });

    expect(pausen).toEqual([1000, 1000]);
  });

  it("pausiert ohne `pauseMs` gar nicht", async () => {
    const warte = vi.fn(async () => {});

    await lauf({ tage: ["2026-03-01", "2026-03-02"], warte });

    expect(warte).not.toHaveBeenCalled();
  });

  it("meldet eine Bilanzzeile unter dem Etikett des Aufrufers", async () => {
    const log = vi.fn();

    await lauf({
      tage: ["2026-03-01", "2026-03-02"],
      etikett: "Cron Körperdaten",
      fetchLive: async (_c, date) => {
        if (date === "2026-03-02") throw new Error("Garmin 500");
        return tag(date);
      },
      log,
    });

    expect(log).toHaveBeenCalledWith(
      "Cron Körperdaten paul: 2 offen, 1 geschrieben, 1 gescheitert (2026-03-02)",
    );
  });
});

/**
 * Die Regel, die vorher zweimal dastand: Ein geschriebener Tag beweist, dass die
 * Verbindung trägt; kaputt ist sie erst, wenn kein einziger offener Tag durchkam.
 */
describe("holeKoerperdatenTage und der Fehler-Marker", () => {
  it("setzt ihn, wenn kein einziger Tag durchkam", async () => {
    const kv = fakeKv();

    await lauf({
      kv,
      tage: ["2026-03-01", "2026-03-02"],
      fetchLive: async () => {
        throw new Error("Garmin 500");
      },
    });

    expect(kv.inhalt.has(MARKER)).toBe(true);
  });

  it("lässt einen einzelnen gescheiterten Tag die Verbindung nicht kaputtschreiben", async () => {
    const kv = fakeKv();

    await lauf({
      kv,
      tage: ["2026-03-01", "2026-03-02"],
      fetchLive: async (_c, date) => {
        if (date === "2026-03-02") throw new Error("Garmin 500");
        return tag(date);
      },
    });

    expect(kv.inhalt.has(MARKER)).toBe(false);
  });

  it("löscht ihn, sobald wieder ein Tag durchkommt", async () => {
    const kv = fakeKv();
    await kv.put(MARKER, JSON.stringify({ meldung: "von gestern" }));

    await lauf({ kv, tage: ["2026-03-01"] });

    expect(kv.inhalt.has(MARKER)).toBe(false);
  });

  it("rührt ihn nicht an, wenn nichts offen war", async () => {
    // Ein Lauf ohne Tage sagt über die Verbindung nichts — weder das eine noch das
    // andere. Genau der Fall der wiederholten Erstbefüllung auf vollem Archiv.
    const kv = fakeKv();
    await kv.put(MARKER, JSON.stringify({ meldung: "von gestern" }));

    const bilanz = await lauf({ kv, tage: [] });

    expect(bilanz).toEqual({ offen: 0, geschrieben: 0, gescheitert: [] });
    expect(kv.inhalt.get(MARKER)).toBe(JSON.stringify({ meldung: "von gestern" }));
  });
});
