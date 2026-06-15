import { describe, it, expect, vi, afterEach } from "vitest";
import { GarminAuth, refreshTokens, type GarminTokens } from "./garminAuth.js";

/** Baut ein JWT mit gegebener exp-Claim (Sekunden). Signatur ist Dummy. */
function makeJwt(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Minimaler In-Memory-KV-Mock (nur get/put, json/text). */
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

function bundle(overrides: Partial<GarminTokens> = {}): GarminTokens {
  return {
    di_token: makeJwt(nowSeconds() + 3600),
    di_refresh_token: "refresh-original",
    di_client_id: "client-123",
    ...overrides,
  };
}

describe("GarminAuth", () => {
  it("gibt einen gültigen Token zurück, ohne zu refreshen", async () => {
    const tokens = bundle();
    const { kv } = makeKv({ "user:paul:garmin": JSON.stringify(tokens) });
    const refresh = vi.fn();

    const auth = new GarminAuth(kv, "paul", refresh);
    const token = await auth.getAccessToken();

    expect(token).toBe(tokens.di_token);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refresht einen abgelaufenen Token und schreibt das Bündel ins KV zurück", async () => {
    const expired = bundle({ di_token: makeJwt(nowSeconds() - 60) });
    const { kv, store, spies } = makeKv({
      "user:paul:garmin": JSON.stringify(expired),
    });
    const refreshed: GarminTokens = {
      di_token: makeJwt(nowSeconds() + 3600),
      di_refresh_token: "refresh-rotated",
      di_client_id: "client-123",
    };
    const refresh = vi.fn(async () => refreshed);

    const auth = new GarminAuth(kv, "paul", refresh);
    const token = await auth.getAccessToken();

    expect(refresh).toHaveBeenCalledWith(expired);
    expect(token).toBe(refreshed.di_token);
    expect(spies.put).toHaveBeenCalledWith(
      "user:paul:garmin",
      JSON.stringify(refreshed),
    );
    expect(JSON.parse(store.get("user:paul:garmin")!)).toEqual(refreshed);
  });

  it("wirft, wenn kein Bündel im KV liegt", async () => {
    const { kv } = makeKv();
    const auth = new GarminAuth(kv, "paul", vi.fn());

    await expect(auth.getAccessToken()).rejects.toThrow(/kein.*Bündel|user:paul:garmin/i);
  });
});

describe("refreshTokens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const old: GarminTokens = {
    di_token: "old-access",
    di_refresh_token: "old-refresh",
    di_client_id: "client-123",
  };

  it("schickt einen OAuth2-Refresh-Grant mit Basic-Auth und liefert das neue Bündel", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshTokens(old);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://diauth.garmin.com/di-oauth2-service/oauth/token");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Basic ${btoa("client-123:")}`);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("client-123");
    expect(body.get("refresh_token")).toBe("old-refresh");

    expect(result).toEqual({
      di_token: "new-access",
      di_refresh_token: "new-refresh",
      di_client_id: "client-123",
    });
  });

  it("behält den alten Refresh-Token, wenn keiner rotiert wird", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ access_token: "new-access" }), {
          status: 200,
        }),
      ),
    );

    const result = await refreshTokens(old);

    expect(result.di_refresh_token).toBe("old-refresh");
    expect(result.di_token).toBe("new-access");
  });

  it("wirft bei HTTP-Fehler", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );

    await expect(refreshTokens(old)).rejects.toThrow(/401/);
  });
});
