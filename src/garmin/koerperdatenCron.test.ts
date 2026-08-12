import { describe, it, expect, vi } from "vitest";

import { laufeKoerperdatenCron, listGarminUsers } from "./koerperdatenCron.js";
import type { KoerperdatenStore } from "./koerperdatenReadThrough.js";
import type { Koerperdaten } from "./formatKoerperdaten.js";
import type { GarminClient } from "./garminClient.js";

/**
 * Fake-KV mit `list({ prefix, cursor })`. `seitengroesse` erzwingt Pagination —
 * der Cron muss über alle Seiten laufen, sonst fielen bei wachsender Athletenzahl
 * still einzelne aus dem Lauf.
 *
 * Seit Issue #44 schreibt der Cron auch: Er setzt und löscht den Fehler-Marker der
 * Garmin-Verbindung. `geschrieben` hält fest, was dabei herauskommt.
 */
function fakeKv(keys: string[], seitengroesse = 1000) {
  const alle = new Set(keys);
  const geschrieben = new Map<string, string>();
  const kv = {
    async get(key: string) {
      return geschrieben.get(key) ?? null;
    },
    async put(key: string, wert: string) {
      alle.add(key);
      geschrieben.set(key, wert);
    },
    async delete(key: string) {
      alle.delete(key);
      geschrieben.delete(key);
    },
    async list({ prefix = "", cursor }: { prefix?: string; cursor?: string } = {}) {
      const passend = [...alle].filter((name) => name.startsWith(prefix)).sort();
      const ab = cursor ? Number(cursor) : 0;
      const seite = passend.slice(ab, ab + seitengroesse);
      const bis = ab + seite.length;
      return {
        keys: seite.map((name) => ({ name })),
        list_complete: bis >= passend.length,
        cursor: String(bis),
      };
    },
  };
  return Object.assign(kv as unknown as KVNamespace, { geschrieben });
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
  const archiv: KoerperdatenStore = {
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
      "google:1234567890",
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

/**
 * Der Cron als Beobachter der Garmin-Verbindung (Issue #44). Er ruft jeden Morgen
 * wirklich an — ein Athlet, der wochenlang nichts abfragt, erführe sonst nie, dass
 * sein Archiv still nicht mehr wächst.
 */
describe("laufeKoerperdatenCron und der Fehler-Marker", () => {
  const MARKER = "user:paul:garmin:fehler";

  it("setzt den Marker, wenn der Athlet vor dem ersten Tag scheitert", async () => {
    const kv = fakeKv(["user:paul:garmin"]);
    const { archiv } = fakeArchiv();

    await laufeKoerperdatenCron({
      kv,
      archiv,
      heute: "2026-03-15",
      buildClient: async () => {
        throw new Error("Refresh-Token ungültig");
      },
      fetchLive: async (_c, date) => tag(date),
      ...stilleLogs,
    });

    const marker = JSON.parse(kv.geschrieben.get(MARKER)!);
    expect(marker.meldung).toContain("Garmin neu");
    // Was der Athlet liest, nennt keine Innereien — auch nicht die des Fehlers.
    expect(marker.meldung).not.toContain("Refresh-Token");
  });

  it("setzt ihn, wenn kein einziger offener Tag durchkam", async () => {
    const kv = fakeKv(["user:paul:garmin"]);
    const { archiv } = fakeArchiv();

    await laufeKoerperdatenCron({
      kv,
      archiv,
      heute: "2026-03-15",
      buildClient: async () => client,
      fetchLive: async () => {
        throw new Error("Garmin 500");
      },
      ...stilleLogs,
    });

    expect(kv.geschrieben.has(MARKER)).toBe(true);
  });

  it("löscht ihn, sobald wieder ein Tag durchkommt", async () => {
    const kv = fakeKv(["user:paul:garmin"]);
    await kv.put(MARKER, JSON.stringify({ meldung: "von gestern", seit: "2026-03-14" }));
    const { archiv } = fakeArchiv();

    await laufeKoerperdatenCron({
      kv,
      archiv,
      heute: "2026-03-15",
      buildClient: async () => client,
      fetchLive: async (_c, date) => tag(date),
      ...stilleLogs,
    });

    expect(kv.geschrieben.has(MARKER)).toBe(false);
  });

  it("lässt einen einzelnen gescheiterten Tag die Verbindung nicht kaputtschreiben", async () => {
    // Asymmetrisch mit Absicht: Ein Tag, den Garmin nicht liefert, ist Alltag —
    // dreizehn geschriebene Tage beweisen, dass die Verbindung trägt.
    const kv = fakeKv(["user:paul:garmin"]);
    const { archiv } = fakeArchiv();

    await laufeKoerperdatenCron({
      kv,
      archiv,
      heute: "2026-03-15",
      buildClient: async () => client,
      fetchLive: async (_c, date) => {
        if (date === "2026-03-05") throw new Error("Garmin 500");
        return tag(date);
      },
      ...stilleLogs,
    });

    expect(kv.geschrieben.has(MARKER)).toBe(false);
  });

});
