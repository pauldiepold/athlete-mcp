import { describe, it, expect, vi } from "vitest";
import { getKoerperdatenRange } from "./koerperdatenReadThrough.js";
import type { KoerperdatenStore } from "./koerperdatenReadThrough.js";
import type { Koerperdaten } from "./formatKoerperdaten.js";

/**
 * Minimaler Koerperdaten-Datensatz für ein Datum. Über stressAvg lassen sich
 * zwei Stände desselben Tages (archiviert vs. live) unterscheiden.
 */
function daten(date: string, stressAvg: number | null = null): Koerperdaten {
  return {
    date,
    hrv: null,
    sleep: null,
    stress: stressAvg === null ? null : { avg: stressAvg, max: null },
    body_battery: null,
    training_readiness: null,
    skin_temp: null,
  };
}

/** In-Memory-Archiv: readRange liefert die sortierten vorhandenen Tage im Bereich. */
function makeStore(initial: Koerperdaten[] = []) {
  const store = new Map(initial.map((d) => [d.date, d]));
  return {
    archive: {
      readRange: vi.fn(async (_userId: string, start: string, end: string) =>
        [...store.values()]
          .filter((d) => d.date >= start && d.date <= end)
          .sort((a, b) => a.date.localeCompare(b.date)),
      ),
      upsert: vi.fn(async (_userId: string, date: string, d: Koerperdaten) => {
        store.set(date, d);
      }),
    } satisfies KoerperdatenStore,
    store,
  };
}

describe("getKoerperdatenRange", () => {
  it("gibt vorhandene Tage zurück, ohne live nachzuladen", async () => {
    const { archive } = makeStore([daten("2026-06-13"), daten("2026-06-14")]);
    const fetchLive = vi.fn();

    const { koerperdaten } = await getKoerperdatenRange({
      store: archive,
      fetchLive,
      userId: "paul",
      start: "2026-06-13",
      end: "2026-06-14",
      heute: "2026-06-20",
    });

    expect(koerperdaten).toEqual([daten("2026-06-13"), daten("2026-06-14")]);
    expect(fetchLive).not.toHaveBeenCalled();
  });

  it("lädt einen fehlenden Tag live nach, upsertet ihn und liefert ihn mit", async () => {
    const { archive, store } = makeStore();
    const fetchLive = vi.fn(async (date: string) => daten(date));

    const { koerperdaten } = await getKoerperdatenRange({
      store: archive,
      fetchLive,
      userId: "paul",
      start: "2026-06-13",
      end: "2026-06-13",
      heute: "2026-06-20",
    });

    expect(fetchLive).toHaveBeenCalledWith("2026-06-13");
    expect(archive.upsert).toHaveBeenCalledWith(
      "paul",
      "2026-06-13",
      daten("2026-06-13"),
    );
    expect(store.get("2026-06-13")).toEqual(daten("2026-06-13"));
    expect(koerperdaten).toEqual([daten("2026-06-13")]);
  });

  it("mischt vorhandene und nachgeladene Tage, sortiert und fetcht nur die Lücken", async () => {
    const { archive } = makeStore([daten("2026-06-12"), daten("2026-06-14")]);
    const fetchLive = vi.fn(async (date: string) => daten(date));

    const { koerperdaten } = await getKoerperdatenRange({
      store: archive,
      fetchLive,
      userId: "paul",
      start: "2026-06-12",
      end: "2026-06-14",
      heute: "2026-06-20",
    });

    expect(fetchLive.mock.calls).toEqual([["2026-06-13"]]);
    expect(koerperdaten).toEqual([
      daten("2026-06-12"),
      daten("2026-06-13"),
      daten("2026-06-14"),
    ]);
  });

  it("füllt eine mehrtägige Lücke Tag für Tag", async () => {
    const { archive } = makeStore();
    const fetchLive = vi.fn(async (date: string) => daten(date));

    const { koerperdaten } = await getKoerperdatenRange({
      store: archive,
      fetchLive,
      userId: "paul",
      start: "2026-06-13",
      end: "2026-06-15",
      heute: "2026-06-20",
    });

    expect(fetchLive.mock.calls).toEqual([
      ["2026-06-13"],
      ["2026-06-14"],
      ["2026-06-15"],
    ]);
    expect(archive.upsert).toHaveBeenCalledTimes(3);
    expect(koerperdaten.map((d) => d.date)).toEqual([
      "2026-06-13",
      "2026-06-14",
      "2026-06-15",
    ]);
  });

  it("holt heute live nach, obwohl der Tag schon im Archiv liegt", async () => {
    const { archive, store } = makeStore([daten("2026-06-20", 20)]);
    const fetchLive = vi.fn(async (date: string) => daten(date, 44));

    const { koerperdaten, hinweise } = await getKoerperdatenRange({
      store: archive,
      fetchLive,
      userId: "paul",
      start: "2026-06-20",
      end: "2026-06-20",
      heute: "2026-06-20",
    });

    expect(fetchLive).toHaveBeenCalledWith("2026-06-20");
    expect(koerperdaten).toEqual([daten("2026-06-20", 44)]);
    expect(store.get("2026-06-20")).toEqual(daten("2026-06-20", 44));
    expect(hinweise).toEqual([]);
  });

  it("holt auch gestern live nach, weil der Cron erst morgens läuft", async () => {
    const { archive, store } = makeStore([daten("2026-06-19", 20)]);
    const fetchLive = vi.fn(async (date: string) => daten(date, 44));

    const { koerperdaten } = await getKoerperdatenRange({
      store: archive,
      fetchLive,
      userId: "paul",
      start: "2026-06-19",
      end: "2026-06-19",
      heute: "2026-06-20",
    });

    expect(fetchLive).toHaveBeenCalledWith("2026-06-19");
    expect(koerperdaten).toEqual([daten("2026-06-19", 44)]);
    expect(store.get("2026-06-19")).toEqual(daten("2026-06-19", 44));
  });

  it("lässt vorgestern und älter im Archiv, holt nur heute und gestern live", async () => {
    const { archive } = makeStore([
      daten("2026-06-17", 20),
      daten("2026-06-18", 20),
      daten("2026-06-19", 20),
      daten("2026-06-20", 20),
    ]);
    const fetchLive = vi.fn(async (date: string) => daten(date, 44));

    const { koerperdaten } = await getKoerperdatenRange({
      store: archive,
      fetchLive,
      userId: "paul",
      start: "2026-06-17",
      end: "2026-06-20",
      heute: "2026-06-20",
    });

    expect(fetchLive.mock.calls).toEqual([["2026-06-19"], ["2026-06-20"]]);
    expect(koerperdaten).toEqual([
      daten("2026-06-17", 20),
      daten("2026-06-18", 20),
      daten("2026-06-19", 44),
      daten("2026-06-20", 44),
    ]);
  });

  it("liefert bei fehlgeschlagenem Live-Abruf den archivierten Stand plus Hinweis", async () => {
    const { archive } = makeStore([daten("2026-06-18", 20), daten("2026-06-20", 20)]);
    const fetchLive = vi.fn(async (date: string) => {
      if (date === "2026-06-20") throw new Error("Garmin 502");
      return daten(date, 44);
    });

    const { koerperdaten, hinweise } = await getKoerperdatenRange({
      store: archive,
      fetchLive,
      userId: "paul",
      start: "2026-06-18",
      end: "2026-06-20",
      heute: "2026-06-20",
    });

    expect(koerperdaten).toEqual([
      daten("2026-06-18", 20),
      daten("2026-06-19", 44),
      daten("2026-06-20", 20),
    ]);
    expect(hinweise).toHaveLength(1);
    expect(hinweise[0]).toContain("2026-06-20");
    expect(hinweise[0]).toMatch(/archiviert/i);
  });

  it("lässt den Tag weg, wenn der Live-Abruf scheitert und nichts archiviert ist", async () => {
    const { archive } = makeStore([daten("2026-06-19", 20)]);
    const fetchLive = vi.fn(async (date: string) => {
      if (date === "2026-06-20") throw new Error("Garmin 502");
      return daten(date, 44);
    });

    const { koerperdaten, hinweise } = await getKoerperdatenRange({
      store: archive,
      fetchLive,
      userId: "paul",
      start: "2026-06-19",
      end: "2026-06-20",
      heute: "2026-06-20",
    });

    expect(koerperdaten).toEqual([daten("2026-06-19", 44)]);
    expect(hinweise).toHaveLength(1);
    expect(hinweise[0]).toContain("2026-06-20");
    expect(hinweise[0]).toMatch(/kein archivierter Stand/i);
  });
});
