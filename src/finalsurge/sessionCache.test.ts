import { describe, it, expect, vi } from "vitest";
import { SessionCache } from "./sessionCache.js";
import type { Session } from "./finalSurgeClient.js";

/** Minimaler In-Memory-KV-Mock (get/put, json/text). */
function makeKv(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const kv = {
    get: vi.fn(async (key: string, type?: string) => {
      const v = store.get(key);
      if (v == null) return null;
      return type === "json" ? JSON.parse(v) : v;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
  return { kv: kv as unknown as KVNamespace, store, spies: kv };
}

const session: Session = { userKey: "uk-1", token: "tok-1" };

describe("SessionCache (per-user)", () => {
  it("liefert die gecachte Session des Nutzers ohne Login", async () => {
    const { kv } = makeKv({
      "user:paul:finalsurge:session": JSON.stringify(session),
    });
    const login = vi.fn();

    const cache = new SessionCache(kv, "paul", login);
    const result = await cache.getSession();

    expect(result).toEqual(session);
    expect(login).not.toHaveBeenCalled();
  });

  it("loggt bei Cache-Miss mit den KV-Creds des Nutzers ein und schreibt unter den per-user-Key", async () => {
    const { kv, store, spies } = makeKv({
      "user:paul:finalsurge": JSON.stringify({
        email: "paul@example.com",
        password: "geheim",
      }),
    });
    const login = vi.fn(async () => session);

    const cache = new SessionCache(kv, "paul", login);
    const result = await cache.getSession();

    expect(login).toHaveBeenCalledWith("paul@example.com", "geheim");
    expect(result).toEqual(session);
    expect(spies.put).toHaveBeenCalledWith(
      "user:paul:finalsurge:session",
      JSON.stringify(session),
      { expirationTtl: expect.any(Number) },
    );
    expect(JSON.parse(store.get("user:paul:finalsurge:session")!)).toEqual(
      session,
    );
  });

  it("wirft, wenn keine Creds für den Nutzer im KV liegen", async () => {
    const { kv } = makeKv();
    const cache = new SessionCache(kv, "paul", vi.fn());

    await expect(cache.getSession()).rejects.toThrow(
      /creds|user:paul:finalsurge/i,
    );
  });

  it("trennt Nutzer: jeder bekommt seinen eigenen Cache-Key", async () => {
    const { spies } = makeKv();
    const { kv } = makeKv({
      "user:lisa:finalsurge": JSON.stringify({
        email: "lisa@example.com",
        password: "pw",
      }),
    });
    void spies;
    const login = vi.fn(async () => session);

    const cache = new SessionCache(kv, "lisa", login);
    await cache.getSession();

    expect(login).toHaveBeenCalledWith("lisa@example.com", "pw");
  });
});
