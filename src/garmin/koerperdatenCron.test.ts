import { describe, it, expect, vi } from "vitest";

import { laufeKoerperdatenCron, listGarminUsers } from "./koerperdatenCron.js";
import type { KoerperdatenCronArchiv } from "./koerperdatenCron.js";
import type { Koerperdaten } from "./formatKoerperdaten.js";
import type { GarminClient } from "./garminClient.js";

/**
 * Fake-KV mit `list({ prefix, cursor })`. `seitengroesse` erzwingt Pagination —
 * der Cron muss über alle Seiten laufen, sonst fielen bei wachsender Athletenzahl
 * still einzelne aus dem Lauf.
 */
function fakeKv(keys: string[], seitengroesse = 1000): KVNamespace {
  return {
    async list({ prefix = "", cursor }: { prefix?: string; cursor?: string } = {}) {
      const passend = keys.filter((name) => name.startsWith(prefix)).sort();
      const ab = cursor ? Number(cursor) : 0;
      const seite = passend.slice(ab, ab + seitengroesse);
      const bis = ab + seite.length;
      return {
        keys: seite.map((name) => ({ name })),
        list_complete: bis >= passend.length,
        cursor: String(bis),
      };
    },
  } as unknown as KVNamespace;
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

/** Archiv über einer Map, das mitschreibt, was der Cron upsertet. */
function fakeArchiv(vorhanden: Record<string, Koerperdaten[]> = {}) {
  const geschrieben: { userId: string; date: string }[] = [];
  const archiv: KoerperdatenCronArchiv = {
    async readRange(userId, start, end) {
      return (vorhanden[userId] ?? []).filter(
        (d) => d.date >= start && d.date <= end,
      );
    },
    async upsert(userId, date) {
      geschrieben.push({ userId, date });
    },
  };
  return { archiv, geschrieben };
}

const client = {} as GarminClient;
const stilleLogs = { log: () => {}, logFehler: () => {} };

describe("listGarminUsers", () => {
  it("findet die Athleten mit Garmin-Bündel und ignoriert andere Kontext-Keys", async () => {
    const kv = fakeKv([
      "user:paul:garmin",
      "user:paul:garmin:profile",
      "user:paul:finalsurge",
      "user:jonas:garmin",
      "user:lena:finalsurge",
      "pathsecret:abc",
    ]);

    expect(await listGarminUsers(kv)).toEqual(["jonas", "paul"]);
  });

  it("läuft über alle KV-Seiten hinweg", async () => {
    const kv = fakeKv(
      ["user:a:garmin", "user:b:garmin", "user:c:garmin"],
      1, // eine Seite pro Aufruf
    );

    expect(await listGarminUsers(kv)).toEqual(["a", "b", "c"]);
  });
});

describe("laufeKoerperdatenCron", () => {
  it("holt die offenen Tage und schreibt sie ins Archiv", async () => {
    // Das Fenster ist 14 Tage; alles bis auf gestern ist archiviert und gefüllt.
    const heute = "2026-03-15";
    const vorhandeneTage = Array.from({ length: 14 }, (_, i) => {
      const d = new Date("2026-03-15T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 14 + i);
      return { ...tag(d.toISOString().slice(0, 10)), stress: { avg: 30, max: 70 } };
    });
    const { archiv, geschrieben } = fakeArchiv({ paul: vorhandeneTage });

    const bilanzen = await laufeKoerperdatenCron({
      kv: fakeKv(["user:paul:garmin"]),
      archiv,
      heute,
      buildClient: async () => client,
      fetchLive: async (_c, date) => tag(date),
      ...stilleLogs,
    });

    // Gestern wird immer geholt (Garmin legt über den Tag nach), sonst nichts.
    expect(geschrieben).toEqual([{ userId: "paul", date: "2026-03-14" }]);
    expect(bilanzen).toEqual([
      { userId: "paul", offen: 1, geschrieben: 1, gescheitert: [] },
    ]);
  });

  it("lässt einen gescheiterten Tag die übrigen Tage nicht blockieren", async () => {
    const { archiv, geschrieben } = fakeArchiv();

    const bilanzen = await laufeKoerperdatenCron({
      kv: fakeKv(["user:paul:garmin"]),
      archiv,
      heute: "2026-03-15",
      buildClient: async () => client,
      fetchLive: async (_c, date) => {
        if (date === "2026-03-05") throw new Error("Garmin 500");
        return tag(date);
      },
      ...stilleLogs,
    });

    // Leeres Archiv → alle 14 Tage des Fensters sind offen, 13 kommen durch.
    expect(bilanzen[0]).toEqual({
      userId: "paul",
      offen: 14,
      geschrieben: 13,
      gescheitert: ["2026-03-05"],
    });
    expect(geschrieben).toHaveLength(13);
    expect(geschrieben.map((g) => g.date)).not.toContain("2026-03-05");
  });

  it("lässt einen gescheiterten Athleten die übrigen nicht blockieren", async () => {
    const { archiv, geschrieben } = fakeArchiv();

    const bilanzen = await laufeKoerperdatenCron({
      kv: fakeKv(["user:paul:garmin", "user:jonas:garmin"]),
      archiv,
      heute: "2026-03-15",
      // jonas' Refresh-Token ist abgerissen — der Client entsteht gar nicht erst.
      buildClient: async (_kv, userId) => {
        if (userId === "jonas") throw new Error("Refresh-Token ungültig");
        return client;
      },
      fetchLive: async (_c, date) => tag(date),
      ...stilleLogs,
    });

    expect(bilanzen).toEqual([
      {
        userId: "jonas",
        offen: 0,
        geschrieben: 0,
        gescheitert: [],
        fehler: "Refresh-Token ungültig",
      },
      { userId: "paul", offen: 14, geschrieben: 14, gescheitert: [] },
    ]);
    expect(geschrieben.every((g) => g.userId === "paul")).toBe(true);
  });

  it("meldet pro Athlet genau eine Bilanzzeile im Log", async () => {
    const log = vi.fn();
    const { archiv } = fakeArchiv();

    await laufeKoerperdatenCron({
      kv: fakeKv(["user:paul:garmin", "user:jonas:garmin"]),
      archiv,
      heute: "2026-03-15",
      buildClient: async () => client,
      fetchLive: async (_c, date) => tag(date),
      log,
      logFehler: () => {},
    });

    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      "Cron Körperdaten paul: 14 offen, 14 geschrieben, 0 gescheitert",
    );
  });

  it("tut nichts, wenn kein Athlet ein Garmin-Bündel hat", async () => {
    const { archiv, geschrieben } = fakeArchiv();

    const bilanzen = await laufeKoerperdatenCron({
      kv: fakeKv(["user:lena:finalsurge"]),
      archiv,
      heute: "2026-03-15",
      buildClient: async () => {
        throw new Error("darf nicht aufgerufen werden");
      },
      fetchLive: async (_c, date) => tag(date),
      ...stilleLogs,
    });

    expect(bilanzen).toEqual([]);
    expect(geschrieben).toEqual([]);
  });
});
