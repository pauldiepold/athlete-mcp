import { describe, it, expect, vi } from "vitest";
import { getKoerperdatenRange } from "./koerperdatenReadThrough.js";
import type { KoerperdatenStore } from "./koerperdatenReadThrough.js";
import type { Koerperdaten } from "./formatKoerperdaten.js";

/** Minimaler Koerperdaten-Datensatz für ein Datum (nur date relevant für die Tests). */
function daten(date: string): Koerperdaten {
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

    const result = await getKoerperdatenRange(
      archive,
      fetchLive,
      "paul",
      "2026-06-13",
      "2026-06-14",
    );

    expect(result).toEqual([daten("2026-06-13"), daten("2026-06-14")]);
    expect(fetchLive).not.toHaveBeenCalled();
  });

  it("lädt einen fehlenden Tag live nach, upsertet ihn und liefert ihn mit", async () => {
    const { archive, store } = makeStore();
    const fetchLive = vi.fn(async (date: string) => daten(date));

    const result = await getKoerperdatenRange(
      archive,
      fetchLive,
      "paul",
      "2026-06-13",
      "2026-06-13",
    );

    expect(fetchLive).toHaveBeenCalledWith("2026-06-13");
    expect(archive.upsert).toHaveBeenCalledWith(
      "paul",
      "2026-06-13",
      daten("2026-06-13"),
    );
    expect(store.get("2026-06-13")).toEqual(daten("2026-06-13"));
    expect(result).toEqual([daten("2026-06-13")]);
  });

  it("mischt vorhandene und nachgeladene Tage, sortiert und fetcht nur die Lücken", async () => {
    const { archive } = makeStore([daten("2026-06-12"), daten("2026-06-14")]);
    const fetchLive = vi.fn(async (date: string) => daten(date));

    const result = await getKoerperdatenRange(
      archive,
      fetchLive,
      "paul",
      "2026-06-12",
      "2026-06-14",
    );

    expect(fetchLive.mock.calls).toEqual([["2026-06-13"]]);
    expect(result).toEqual([
      daten("2026-06-12"),
      daten("2026-06-13"),
      daten("2026-06-14"),
    ]);
  });

  it("füllt eine mehrtägige Lücke Tag für Tag", async () => {
    const { archive } = makeStore();
    const fetchLive = vi.fn(async (date: string) => daten(date));

    const result = await getKoerperdatenRange(
      archive,
      fetchLive,
      "paul",
      "2026-06-13",
      "2026-06-15",
    );

    expect(fetchLive.mock.calls).toEqual([
      ["2026-06-13"],
      ["2026-06-14"],
      ["2026-06-15"],
    ]);
    expect(archive.upsert).toHaveBeenCalledTimes(3);
    expect(result.map((d) => d.date)).toEqual([
      "2026-06-13",
      "2026-06-14",
      "2026-06-15",
    ]);
  });
});
