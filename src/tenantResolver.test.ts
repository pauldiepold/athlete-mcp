import { describe, it, expect, vi } from "vitest";
import { TenantResolver } from "./tenantResolver.js";

/** Minimaler In-Memory-KV-Mock (nur get). */
function makeKv(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const kv = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
  };
  return kv as unknown as KVNamespace;
}

describe("TenantResolver", () => {
  it("löst ein bekanntes Pfad-Secret auf die zugehörige userId auf", async () => {
    const kv = makeKv({ "pathsecret:s3cret": "paul" });
    const resolver = new TenantResolver(kv);

    expect(await resolver.resolve("/s3cret/mcp")).toBe("paul");
  });

  it("liefert null für ein unbekanntes Secret", async () => {
    const kv = makeKv({ "pathsecret:s3cret": "paul" });
    const resolver = new TenantResolver(kv);

    expect(await resolver.resolve("/fremd/mcp")).toBeNull();
  });

  it("liefert null für Pfade, die nicht /<secret>/mcp sind", async () => {
    const kv = makeKv({ "pathsecret:s3cret": "paul" });
    const resolver = new TenantResolver(kv);

    expect(await resolver.resolve("/s3cret")).toBeNull();
    expect(await resolver.resolve("/mcp")).toBeNull();
    expect(await resolver.resolve("/")).toBeNull();
    expect(await resolver.resolve("/s3cret/mcp/extra")).toBeNull();
    expect(await resolver.resolve("/s3cret/sse")).toBeNull();
  });

  it("löst ein View-Secret aus dem getrennten viewsecret-Namespace auf", async () => {
    const kv = makeKv({ "viewsecret:v13w": "paul" });
    const resolver = new TenantResolver(kv);

    expect(await resolver.resolveViewSecret("v13w")).toBe("paul");
  });

  it("trennt View- und MCP-Secret-Namespace (kein Cross-Resolve)", async () => {
    const kv = makeKv({ "pathsecret:s3cret": "paul" });
    const resolver = new TenantResolver(kv);

    // Das MCP-Secret darf nicht über den View-Namespace auflösbar sein.
    expect(await resolver.resolveViewSecret("s3cret")).toBeNull();
  });

  it("liefert null für ein unbekanntes View-Secret", async () => {
    const kv = makeKv({ "viewsecret:v13w": "paul" });
    const resolver = new TenantResolver(kv);

    expect(await resolver.resolveViewSecret("fremd")).toBeNull();
  });
});
