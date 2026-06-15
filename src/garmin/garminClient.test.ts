import { describe, it, expect, vi, afterEach } from "vitest";
import { GarminClient } from "./garminClient.js";
import type { TokenProvider } from "./garminAuth.js";

const auth: TokenProvider = {
  getAccessToken: async () => "test-di-token",
};

/** Routet fetch nach URL-Teilstring auf eine JSON-Antwort; Default 200 {}. */
function routeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = input.toString();
    const match = Object.keys(routes).find((frag) => url.includes(frag));
    const payload = match ? routes[match] : {};
    return new Response(JSON.stringify(payload), { status: 200 });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GarminClient.getKoerperdaten", () => {
  it("holt alle fünf Metriken und gibt sie gruppiert roh zurück", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/hrv-service/hrv/": { hrvSummary: { status: "BALANCED" } },
        "/dailySleepData/": { dailySleepDTO: { sleepTimeSeconds: 25380 } },
        "/dailyStress/": { avgStressLevel: 34 },
        "/bodyBattery/reports/daily": [{ charged: 43, drained: 47 }],
        "/trainingreadiness/": [{ score: 70 }],
      }),
    );

    const client = new GarminClient(auth, "paul.display");
    const raw = await client.getKoerperdaten("2026-06-13");

    expect(raw).toEqual({
      hrv: { hrvSummary: { status: "BALANCED" } },
      sleep: { dailySleepDTO: { sleepTimeSeconds: 25380 } },
      stress: { avgStressLevel: 34 },
      bodyBattery: [{ charged: 43, drained: 47 }],
      trainingReadiness: [{ score: 70 }],
    });
  });

  it("ruft jeden Endpoint mit Bearer-Auth, Accept-Header und korrekten Datums-Params", async () => {
    const fetchMock = routeFetch({});
    vi.stubGlobal("fetch", fetchMock);

    const client = new GarminClient(auth, "paul.display");
    await client.getKoerperdaten("2026-06-13");

    const calls = fetchMock.mock.calls.map(([input, init]) => ({
      url: input.toString(),
      init: init as RequestInit,
    }));

    // Jeder Call trägt Bearer-Token + Accept
    for (const { init } of calls) {
      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-di-token");
      expect(headers["Accept"]).toBe("application/json");
    }

    const urls = calls.map((c) => c.url);
    expect(urls).toContainEqual(
      "https://connectapi.garmin.com/hrv-service/hrv/2026-06-13",
    );
    expect(urls).toContainEqual(
      "https://connectapi.garmin.com/wellness-service/wellness/dailyStress/2026-06-13",
    );
    expect(urls).toContainEqual(
      "https://connectapi.garmin.com/metrics-service/metrics/trainingreadiness/2026-06-13",
    );
    expect(
      urls.find((u) => u.includes("/dailySleepData/")),
    ).toBe(
      "https://connectapi.garmin.com/wellness-service/wellness/dailySleepData/paul.display?date=2026-06-13&nonSleepBufferMinutes=60",
    );
    expect(
      urls.find((u) => u.includes("/bodyBattery/reports/daily")),
    ).toBe(
      "https://connectapi.garmin.com/wellness-service/wellness/bodyBattery/reports/daily?startDate=2026-06-13&endDate=2026-06-13",
    );
  });

  it("wirft, wenn ein Endpoint einen HTTP-Fehler liefert", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );

    const client = new GarminClient(auth, "paul.display");
    await expect(client.getKoerperdaten("2026-06-13")).rejects.toThrow(/401/);
  });
});
