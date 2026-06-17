import { describe, it, expect } from "vitest";
import { SteuerungStore, isValidKw, assertValidKw } from "./steuerungStore.js";

/**
 * Minimaler In-Memory-D1-Ersatz: deckt genau die fünf Statements von SteuerungStore
 * ab (per SQL-Substring erkannt), gestützt auf zwei Maps. Reicht, um leeren Zustand,
 * Upsert/Overwrite und die listWochen-Sortierung ohne echte D1 zu prüfen.
 */
function fakeDb() {
  const plan = new Map<string, string>(); // user_id -> content
  const wochen = new Map<string, string>(); // `${user_id}|${kw}` -> content

  function exec(sql: string, args: unknown[]) {
    if (sql.startsWith("SELECT content FROM steuerungsplan")) {
      const [userId] = args as [string];
      const content = plan.get(userId);
      return { first: content === undefined ? null : { content } };
    }
    if (sql.startsWith("INSERT INTO steuerungsplan")) {
      const [userId, content] = args as [string, string];
      plan.set(userId, content);
      return {};
    }
    if (sql.startsWith("SELECT kw FROM steuerung_woche")) {
      const [userId] = args as [string];
      const rows = [...wochen.keys()]
        .filter((k) => k.startsWith(`${userId}|`))
        .map((k) => ({ kw: k.split("|")[1]! }))
        .sort((a, b) => a.kw.localeCompare(b.kw));
      return { all: { results: rows } };
    }
    if (sql.startsWith("SELECT content FROM steuerung_woche")) {
      const [userId, kw] = args as [string, string];
      const content = wochen.get(`${userId}|${kw}`);
      return { first: content === undefined ? null : { content } };
    }
    if (sql.startsWith("INSERT INTO steuerung_woche")) {
      const [userId, kw, content] = args as [string, string, string];
      wochen.set(`${userId}|${kw}`, content);
      return {};
    }
    throw new Error(`unerwartetes SQL: ${sql}`);
  }

  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              return exec(sql, args).first ?? null;
            },
            async all() {
              return exec(sql, args).all ?? { results: [] };
            },
            async run() {
              return exec(sql, args);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("isValidKw / assertValidKw", () => {
  it("akzeptiert nur sortierbares YYYY-Www", () => {
    expect(isValidKw("2026-W25")).toBe(true);
    expect(isValidKw("2026-W05")).toBe(true);
    expect(isValidKw("2026-W53")).toBe(true);
  });

  it("lehnt abweichende Formate ab", () => {
    for (const bad of ["2026-25", "KW25", "2026-W5", "2026-w25", "26-W25", ""]) {
      expect(isValidKw(bad)).toBe(false);
    }
  });

  it("assertValidKw wirft mit klarer Meldung", () => {
    expect(() => assertValidKw("2026-W5")).toThrow(/YYYY-Www/);
  });
});

describe("SteuerungStore", () => {
  it("liefert leeren Plan, wenn keiner gesetzt ist", async () => {
    const store = new SteuerungStore(fakeDb());
    expect(await store.getPlan("paul")).toBe("");
  });

  it("setzt und überschreibt den Plan", async () => {
    const store = new SteuerungStore(fakeDb());
    await store.setPlan("paul", "# Plan v1");
    expect(await store.getPlan("paul")).toBe("# Plan v1");
    await store.setPlan("paul", "# Plan v2");
    expect(await store.getPlan("paul")).toBe("# Plan v2");
  });

  it("trennt Pläne nach user_id", async () => {
    const store = new SteuerungStore(fakeDb());
    await store.setPlan("paul", "# Paul");
    expect(await store.getPlan("jonathan")).toBe("");
  });

  it("liefert leere Wochenliste und leere Einzelwoche initial", async () => {
    const store = new SteuerungStore(fakeDb());
    expect(await store.listWochen("paul")).toEqual([]);
    expect(await store.getWoche("paul", "2026-W25")).toBe("");
  });

  it("setzt, überschreibt und listet Wochen sortiert", async () => {
    const store = new SteuerungStore(fakeDb());
    await store.setWoche("paul", "2026-W26", "# W26");
    await store.setWoche("paul", "2026-W25", "# W25");
    expect(await store.listWochen("paul")).toEqual(["2026-W25", "2026-W26"]);
    expect(await store.getWoche("paul", "2026-W25")).toBe("# W25");

    await store.setWoche("paul", "2026-W25", "# W25 korrigiert");
    expect(await store.getWoche("paul", "2026-W25")).toBe("# W25 korrigiert");
    expect(await store.listWochen("paul")).toEqual(["2026-W25", "2026-W26"]);
  });

  it("weist malformte kw in get/set ab", async () => {
    const store = new SteuerungStore(fakeDb());
    await expect(store.setWoche("paul", "2026-25", "x")).rejects.toThrow(/YYYY-Www/);
    await expect(store.getWoche("paul", "KW25")).rejects.toThrow(/YYYY-Www/);
  });
});
