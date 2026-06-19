import { describe, it, expect, vi } from "vitest";
import { handleSteuerungView } from "./steuerungView.js";
import { SteuerungStore } from "./steuerungStore.js";

/** Minimaler KV-Mock (nur get) für die View-Secret-Auflösung. */
function makeKv(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
  } as unknown as KVNamespace;
}

/**
 * Minimaler In-Memory-D1-Ersatz (gleiche Statements wie SteuerungStore, per
 * SQL-Substring erkannt). Wird über den echten Store geseedet, damit der Test
 * den realen Lesepfad der Ansicht abdeckt.
 */
function fakeDb() {
  const plan = new Map<string, string>();
  const wochen = new Map<string, string>();

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

/** Db + KV (View-Secret → userId) für einen geseedeten Nutzer aufsetzen. */
async function setup(seed: (store: SteuerungStore) => Promise<void>) {
  const db = fakeDb();
  await seed(new SteuerungStore(db));
  const kv = makeKv({ "viewsecret:v13w": "paul" });
  return { db, kv };
}

describe("handleSteuerungView – Routing & Auth", () => {
  it("gibt null für Pfade zurück, die keine View-Route sind", async () => {
    const { db, kv } = await setup(async () => {});

    expect(await handleSteuerungView("/v13w/mcp", kv, db)).toBeNull();
    expect(await handleSteuerungView("/", kv, db)).toBeNull();
    expect(await handleSteuerungView("/v13w/steuerung/extra/tief", kv, db)).toBeNull();
  });

  it("antwortet 404 bei unbekanntem View-Secret", async () => {
    const { db, kv } = await setup(async () => {});

    const res = await handleSteuerungView("/fremd/steuerung", kv, db);
    expect(res?.status).toBe(404);
  });

  it("antwortet 404 bei ungültigem kw-Format (vor jeder DB-Last)", async () => {
    const { db, kv } = await setup(async () => {});

    const res = await handleSteuerungView("/v13w/steuerung/2026-W5", kv, db);
    expect(res?.status).toBe(404);
  });
});

describe("handleSteuerungView – Index", () => {
  it("rendert den Steuerungsplan und die Wochen neueste-zuerst", async () => {
    const { db, kv } = await setup(async (store) => {
      await store.setPlan("paul", "# Block 3\n\nAufbau bis zum Zielrennen.");
      await store.setWoche("paul", "2026-W24", "W24");
      await store.setWoche("paul", "2026-W25", "W25");
    });

    const res = await handleSteuerungView("/v13w/steuerung", kv, db);
    expect(res?.status).toBe(200);
    expect(res?.headers.get("content-type")).toContain("text/html");

    const html = await res!.text();
    // Markdown des Plans wird zu echtem HTML gerendert.
    expect(html).toContain("Block 3");
    expect(html).toMatch(/<h1[^>]*>Block 3/);
    // Beide Wochen verlinkt, neueste zuerst (W25 vor W24).
    expect(html).toContain('href="/v13w/steuerung/2026-W25"');
    expect(html).toContain('href="/v13w/steuerung/2026-W24"');
    expect(html.indexOf("2026-W25")).toBeLessThan(html.indexOf("2026-W24"));
  });

  it("zeigt leere Hinweise, wenn weder Plan noch Wochen existieren", async () => {
    const { db, kv } = await setup(async () => {});

    const html = await (await handleSteuerungView("/v13w/steuerung", kv, db))!.text();
    expect(html).toContain("Noch kein Steuerungsplan");
    expect(html).toContain("Noch keine Wocheneinträge");
  });
});

describe("handleSteuerungView – Woche", () => {
  it("rendert die Woche mit Prev/Next/Index-Navigation über Lücken hinweg", async () => {
    const { db, kv } = await setup(async (store) => {
      await store.setWoche("paul", "2026-W23", "W23");
      await store.setWoche("paul", "2026-W25", "**Soll/Ist** W25");
      await store.setWoche("paul", "2026-W27", "W27");
    });

    const html = await (await handleSteuerungView("/v13w/steuerung/2026-W25", kv, db))!.text();
    // Inhalt der Woche gerendert (Markdown → HTML).
    expect(html).toMatch(/<strong>Soll\/Ist<\/strong>/);
    // Prev/Next springen zur nächsten existierenden Woche, nicht zu W24/W26.
    expect(html).toContain('href="/v13w/steuerung/2026-W23"');
    expect(html).toContain('href="/v13w/steuerung/2026-W27"');
    // Index-Link ist immer dabei.
    expect(html).toContain('href="/v13w/steuerung"');
  });

  it("unterdrückt Prev/Next an den Rändern der Wochenliste", async () => {
    const { db, kv } = await setup(async (store) => {
      await store.setWoche("paul", "2026-W25", "einzige Woche");
    });

    const html = await (await handleSteuerungView("/v13w/steuerung/2026-W25", kv, db))!.text();
    // Keine Nachbar-Links, nur der Index-Link.
    expect(html).not.toContain("/v13w/steuerung/2026-W2");
    expect(html).toContain('href="/v13w/steuerung"');
  });

  it("zeigt einen Hinweis für eine kw ohne Eintrag (200, nicht 404)", async () => {
    const { db, kv } = await setup(async (store) => {
      await store.setWoche("paul", "2026-W25", "da");
    });

    const res = await handleSteuerungView("/v13w/steuerung/2026-W30", kv, db);
    expect(res?.status).toBe(200);
    expect(await res!.text()).toContain("keinen Eintrag");
  });
});
