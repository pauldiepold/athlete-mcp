import { describe, it, expect } from "vitest";
import { resolveDashboardLinks } from "./dashboardLink.js";

/**
 * Minimale Fake-KV über einer Map: nur `list({ prefix })` und `get`, wie von der
 * Secret-Auflösung genutzt (dieselbe Machart wie in operatorDirectory.test.ts).
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

const WEB = "https://athlete-web.example.dev";

describe("resolveDashboardLinks", () => {
  it("baut die Links aus dem View-Secret des Nutzers", async () => {
    const kv = fakeKv({
      "viewsecret:paul-view": "paul",
      "pathsecret:paul-path": "paul",
    });

    expect(await resolveDashboardLinks(kv, "paul", WEB)).toEqual({
      dashboard: `${WEB}/paul-view`,
      steuerung: `${WEB}/paul-view/steuerung`,
      tagVorlage: `${WEB}/paul-view/tag/YYYY-MM-DD`,
    });
  });

  it("gibt bei mehreren Nutzern jedem nur sein eigenes Secret", async () => {
    const kv = fakeKv({
      "viewsecret:ann-view": "ann",
      "viewsecret:zoe-view": "zoe",
    });

    const ann = await resolveDashboardLinks(kv, "ann", WEB);
    const zoe = await resolveDashboardLinks(kv, "zoe", WEB);

    expect(ann!.dashboard).toBe(`${WEB}/ann-view`);
    expect(zoe!.dashboard).toBe(`${WEB}/zoe-view`);
  });

  it("liefert null für einen Nutzer ohne View-Secret", async () => {
    const kv = fakeKv({ "viewsecret:zoe-view": "zoe" });
    expect(await resolveDashboardLinks(kv, "paul", WEB)).toBeNull();
  });

  it("verwechselt das Pfad-Secret nicht mit dem View-Secret", async () => {
    // Nur ein MCP-Pfad-Secret geseedet: der Nutzer hat keine Browser-Fläche —
    // und keinesfalls darf das Schreib-Secret in einen Browser-Link geraten.
    const kv = fakeKv({ "pathsecret:paul-path": "paul" });
    expect(await resolveDashboardLinks(kv, "paul", WEB)).toBeNull();
  });

  it("normalisiert einen Schrägstrich am Ende der Basis-URL", async () => {
    const kv = fakeKv({ "viewsecret:paul-view": "paul" });

    const links = await resolveDashboardLinks(kv, "paul", `${WEB}/`);

    expect(links!.dashboard).toBe(`${WEB}/paul-view`);
    expect(links!.steuerung).toBe(`${WEB}/paul-view/steuerung`);
  });
});
