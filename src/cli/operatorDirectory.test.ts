import { describe, it, expect } from "vitest";
import { listOnboardedUsers } from "./operatorDirectory.js";

/**
 * Minimale Fake-KV über einer Map: nur `list({ prefix })` und `get` wie vom
 * Operator-Directory genutzt. Liefert alles in einer Seite (list_complete), die
 * Pagination ist über echte KV ohnehin transparent.
 */
function fakeKv(entries: Record<string, string>): KVNamespace {
  const store = new Map(Object.entries(entries));
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async list({ prefix = "" }: { prefix?: string } = {}) {
      const keys = [...store.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

// Bewusst zwei verschiedene Hosts (ADR-0004): so schlägt ein Vertauschen der
// Bases im Test fehl, statt unentdeckt zu bleiben.
const MCP = "https://athlete-mcp.example.dev";
const WEB = "https://athlete-web.example.dev";
const BASES = { mcpBaseUrl: MCP, webBaseUrl: WEB };

describe("listOnboardedUsers", () => {
  it("löst MCP- und View-URL je Nutzer korrekt aus dem Reverse-Mapping auf", async () => {
    const kv = fakeKv({
      "pathsecret:paul-path": "paul",
      "viewsecret:paul-view": "paul",
      "user:paul:finalsurge": "{}",
      "user:paul:garmin": "{}",
      "user:paul:garmin:profile": "{}",
    });

    const users = await listOnboardedUsers(kv, BASES);

    expect(users).toHaveLength(1);
    expect(users[0]).toEqual({
      userId: "paul",
      mcpUrl: `${MCP}/paul-path/mcp`,
      viewUrl: `${WEB}/paul-view`,
      viewPath: "/paul-view",
      seededContexts: { finalSurge: true, garmin: true, view: true },
    });
  });

  it("listet mehrere Nutzer nach userId sortiert, je mit eigenen Secrets", async () => {
    const kv = fakeKv({
      "pathsecret:zoe-path": "zoe",
      "viewsecret:zoe-view": "zoe",
      "user:zoe:garmin": "{}",
      "pathsecret:ann-path": "ann",
      "viewsecret:ann-view": "ann",
      "user:ann:garmin": "{}",
    });

    const users = await listOnboardedUsers(kv, BASES);

    expect(users.map((u) => u.userId)).toEqual(["ann", "zoe"]);
    expect(users[0]!.mcpUrl).toBe(`${MCP}/ann-path/mcp`);
    expect(users[0]!.viewUrl).toBe(`${WEB}/ann-view`);
    expect(users[1]!.mcpUrl).toBe(`${MCP}/zoe-path/mcp`);
    expect(users[1]!.viewUrl).toBe(`${WEB}/zoe-view`);
  });

  it("liefert viewUrl=null und view=false für einen Nutzer ohne View-Secret", async () => {
    const kv = fakeKv({
      "pathsecret:paul-path": "paul",
      "user:paul:garmin": "{}",
    });

    const users = await listOnboardedUsers(kv, BASES);

    expect(users[0]!.viewUrl).toBeNull();
    expect(users[0]!.viewPath).toBeNull();
    expect(users[0]!.seededContexts.view).toBe(false);
    expect(users[0]!.mcpUrl).toBe(`${MCP}/paul-path/mcp`);
  });

  it("matcht `:garmin` nicht gegen `:garmin:profile` (kein falscher Kontext)", async () => {
    const kv = fakeKv({
      "pathsecret:paul-path": "paul",
      // Nur das Profil, kein Token-Bündel: garmin-Kontext gilt als nicht geseedet.
      "user:paul:garmin:profile": "{}",
    });

    const users = await listOnboardedUsers(kv, BASES);

    expect(users[0]!.seededContexts.garmin).toBe(false);
    expect(users[0]!.seededContexts.finalSurge).toBe(false);
  });

  it("ist leer, wenn kein Nutzer ein Pfad-Secret hat", async () => {
    const kv = fakeKv({ "viewsecret:orphan-view": "orphan" });
    expect(await listOnboardedUsers(kv, BASES)).toEqual([]);
  });
});
