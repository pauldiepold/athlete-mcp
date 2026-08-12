import { describe, it, expect } from "vitest";

import type { Koerperdaten } from "./formatKoerperdaten.js";
import type { GarminClient } from "./garminClient.js";
import {
  ERSTBEFUELLUNG_FENSTER_TAGE,
  ERSTBEFUELLUNG_SCHREIBABSTAND_MS,
  erstbefuellungKey,
  erstbefuellungStart,
  erstzubefuellendeTage,
  fuehreErstbefuellungAus,
  leseErstbefuellung,
  offeneErstbefuellungsTage,
  reserviereErstbefuellung,
  verschleppteTage,
} from "./koerperdatenErstbefuellung.js";
import type { ErstbefuellungOptions } from "./koerperdatenErstbefuellung.js";
import type { KoerperdatenStore } from "./koerperdatenReadThrough.js";
import { fehlerKey } from "../verbindungen.js";

/** Fake-KV über einer Map — mehr braucht die Erstbefüllung nicht (kein `list`). */
function fakeKv(inhalt: Record<string, string> = {}) {
  const daten = new Map(Object.entries(inhalt));
  const ttls = new Map<string, number | undefined>();
  const kv = {
    async get(key: string) {
      return daten.get(key) ?? null;
    },
    async put(key: string, wert: string, opts?: { expirationTtl?: number }) {
      daten.set(key, wert);
      ttls.set(key, opts?.expirationTtl);
    },
    async delete(key: string) {
      daten.delete(key);
      ttls.delete(key);
    },
  };
  return Object.assign(kv as unknown as KVNamespace, { daten, ttls });
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

/** Archiv über einer Liste, das mitschreibt, was upsertet wurde. */
function fakeArchiv(vorhanden: Koerperdaten[] = []) {
  const geschrieben: string[] = [];
  const archiv: KoerperdatenStore = {
    async readRange(_userId, start, end) {
      return vorhanden.filter((d) => d.date >= start && d.date <= end);
    },
    async upsert(_userId, date) {
      geschrieben.push(date);
    },
  };
  return { archiv, geschrieben };
}

const client = {} as GarminClient;
const stilleLogs = { log: () => {}, logFehler: () => {} };

/**
 * Gemeinsame Test-Verdrahtung: nie echtes Garmin, nie echte Pausen. `warte` ist auch
 * dann überschrieben, wenn `pauseMs` schon 0 ist — der Abstand vor dem
 * Abschluss-Schreiben geht nicht über `pauseMs` und schliefe sonst in jedem Testlauf
 * echte Sekunden.
 */
function optionen(over: Partial<ErstbefuellungOptions> = {}) {
  return {
    userId: "paul",
    heute: "2026-08-06",
    buildClient: async () => client,
    fetchLive: async (_c: GarminClient, date: string) => tag(date),
    pauseMs: 0,
    warte: async () => {},
    ...stilleLogs,
    ...over,
  } as ErstbefuellungOptions;
}

/**
 * Reservieren und ausführen — derselbe Zweischritt, den der Web-Adapter geht
 * (`server/utils/erstbefuellung.ts`), nur ohne Hintergrund. Ein bequemer Einzelaufruf
 * im Produktivcode wäre ein zweiter Weg, den nur diese Datei je nimmt.
 */
async function laufe(opts: ErstbefuellungOptions) {
  const { reserviert, lauf } = await reserviereErstbefuellung(opts.kv, opts.userId);
  if (!reserviert) return { gestartet: false, lauf };

  return {
    gestartet: true,
    lauf: await fuehreErstbefuellungAus({ ...opts, begonnen: lauf.begonnen }),
  };
}

describe("erstzubefuellendeTage", () => {
  it("holt das ganze Fenster inklusive heute, wenn das Archiv leer ist", () => {
    const tage = erstzubefuellendeTage({ vorhanden: [], heute: "2026-08-06" });

    expect(tage).toHaveLength(ERSTBEFUELLUNG_FENSTER_TAGE);
    expect(tage[0]).toBe("2026-07-08");
    expect(tage.at(-1)).toBe("2026-08-06");
    expect(erstbefuellungStart("2026-08-06")).toBe("2026-07-08");
  });

  it("lässt bereits archivierte Tage aus — auch heute", () => {
    const tage = erstzubefuellendeTage({
      vorhanden: [tag("2026-07-08"), tag("2026-08-01"), tag("2026-08-06")],
      heute: "2026-08-06",
    });

    expect(tage).toHaveLength(ERSTBEFUELLUNG_FENSTER_TAGE - 3);
    expect(tage).not.toContain("2026-07-08");
    expect(tage).not.toContain("2026-08-01");
    expect(tage).not.toContain("2026-08-06");
  });

  it("ignoriert Zeilen außerhalb des Fensters", () => {
    const tage = erstzubefuellendeTage({
      vorhanden: [tag("2026-07-07"), tag("2026-08-07")],
      heute: "2026-08-06",
    });

    expect(tage).toHaveLength(ERSTBEFUELLUNG_FENSTER_TAGE);
  });
});

describe("Erstbefüllungs-Lauf", () => {
  it("holt alle offenen Tage sequentiell und meldet die Verbindung als tragfähig", async () => {
    const kv = fakeKv({ [fehlerKey("paul", "garmin")]: '{"meldung":"alt","seit":"x"}' });
    const { archiv, geschrieben } = fakeArchiv();

    const { gestartet, lauf } = await laufe(
      optionen({ kv, archiv }),
    );

    expect(gestartet).toBe(true);
    expect(geschrieben).toHaveLength(ERSTBEFUELLUNG_FENSTER_TAGE);
    expect(geschrieben).toEqual([...geschrieben].sort());
    expect(lauf).toMatchObject({
      status: "fertig",
      offen: ERSTBEFUELLUNG_FENSTER_TAGE,
      geschrieben: ERSTBEFUELLUNG_FENSTER_TAGE,
      gescheitert: 0,
    });
    // Ein geschriebener Tag beweist, dass die Verbindung trägt.
    expect(kv.daten.has(fehlerKey("paul", "garmin"))).toBe(false);
  });

  it("pausiert zwischen den Tagen, aber nicht vor dem ersten", async () => {
    const kv = fakeKv();
    const { archiv } = fakeArchiv();
    const pausen: number[] = [];

    await laufe(
      optionen({
        kv,
        archiv,
        pauseMs: 1000,
        warte: async (ms: number) => {
          pausen.push(ms);
        },
      }),
    );

    // Eine Pause weniger als Tage, dazu am Ende der Abstand zum Reservierungs-Schreiben.
    expect(pausen.slice(0, -1)).toHaveLength(ERSTBEFUELLUNG_FENSTER_TAGE - 1);
    expect(pausen.slice(0, -1).every((ms) => ms === 1000)).toBe(true);
    expect(pausen.at(-1)).toBeLessThanOrEqual(ERSTBEFUELLUNG_SCHREIBABSTAND_MS);
  });

  it("wartet vor dem Abschluss, damit KV den zweiten Schreibvorgang annimmt", async () => {
    const kv = fakeKv();
    // Alles schon da: Der Lauf ist in Millisekunden durch, und ohne den Abstand fielen
    // „läuft" und „fertig" in dieselbe Sekunde auf denselben Schlüssel — der zweite
    // ginge verloren und die Startseite bliebe im Ladehinweis stehen.
    const { archiv } = fakeArchiv(
      erstzubefuellendeTage({ vorhanden: [], heute: "2026-08-06" }).map(tag),
    );
    const pausen: number[] = [];

    const { lauf } = await laufe(
      optionen({
        kv,
        archiv,
        warte: async (ms: number) => {
          pausen.push(ms);
        },
      }),
    );

    expect(lauf.status).toBe("fertig");
    expect(pausen).toHaveLength(1);
    expect(pausen[0]).toBeGreaterThan(0);
    expect(pausen[0]).toBeLessThanOrEqual(ERSTBEFUELLUNG_SCHREIBABSTAND_MS);
    expect((await leseErstbefuellung(kv, "paul"))?.status).toBe("fertig");
  });

  it("wartet auch, wenn der Lauf schon am Client-Aufbau scheitert", async () => {
    const kv = fakeKv();
    const { archiv } = fakeArchiv();
    const pausen: number[] = [];

    const { lauf } = await laufe(
      optionen({
        kv,
        archiv,
        buildClient: async () => {
          throw new Error("Refresh-Token abgelaufen");
        },
        warte: async (ms: number) => {
          pausen.push(ms);
        },
      }),
    );

    expect(lauf.status).toBe("gescheitert");
    expect(pausen).toHaveLength(1);
    expect((await leseErstbefuellung(kv, "paul"))?.status).toBe("gescheitert");
  });

  it("ruft archivierte Tage nicht erneut ab", async () => {
    const kv = fakeKv();
    const { archiv, geschrieben } = fakeArchiv([
      tag("2026-08-05"),
      tag("2026-08-06"),
    ]);

    const { lauf } = await laufe(optionen({ kv, archiv }));

    expect(geschrieben).not.toContain("2026-08-05");
    expect(geschrieben).not.toContain("2026-08-06");
    expect(lauf.offen).toBe(ERSTBEFUELLUNG_FENSTER_TAGE - 2);
  });

  it("hinterlässt einen laufenden Zustand, solange geholt wird", async () => {
    const kv = fakeKv();
    const { archiv } = fakeArchiv();
    const gesehen: (string | undefined)[] = [];

    await laufe(
      optionen({
        kv,
        archiv,
        fetchLive: async (_c: GarminClient, date: string) => {
          gesehen.push((await leseErstbefuellung(kv, "paul"))?.status);
          return tag(date);
        },
      }),
    );

    expect(gesehen.every((s) => s === "laeuft")).toBe(true);
    // Der laufende Zustand läuft von selbst ab, der fertige bleibt stehen.
    expect(kv.ttls.get(erstbefuellungKey("paul"))).toBeUndefined();
    expect((await leseErstbefuellung(kv, "paul"))?.status).toBe("fertig");
  });

  it("startet nicht parallel zu einem laufenden Lauf", async () => {
    const kv = fakeKv();
    const { archiv, geschrieben } = fakeArchiv();
    const zweites: Awaited<ReturnType<typeof laufe>>[] = [];

    await laufe(
      optionen({
        kv,
        archiv,
        fetchLive: async (_c: GarminClient, date: string) => {
          if (!zweites.length) {
            zweites.push(await laufe(optionen({ kv, archiv })));
          }
          return tag(date);
        },
      }),
    );

    expect(zweites[0]?.gestartet).toBe(false);
    expect(zweites[0]?.lauf.status).toBe("laeuft");
    // Nur der erste Lauf hat geschrieben.
    expect(geschrieben).toHaveLength(ERSTBEFUELLUNG_FENSTER_TAGE);
  });

  it("startet nach einem beendeten Lauf wieder", async () => {
    const kv = fakeKv();
    const { archiv } = fakeArchiv();

    await laufe(optionen({ kv, archiv }));
    const zweiter = await laufe(optionen({ kv, archiv }));

    expect(zweiter.gestartet).toBe(true);
  });

  it("lässt einen gescheiterten Tag die übrigen nicht abbrechen", async () => {
    const kv = fakeKv();
    const { archiv, geschrieben } = fakeArchiv();

    const { lauf } = await laufe(
      optionen({
        kv,
        archiv,
        fetchLive: async (_c: GarminClient, date: string) => {
          if (date === "2026-07-20") throw new Error("429");
          return tag(date);
        },
      }),
    );

    expect(lauf.status).toBe("fertig");
    expect(lauf.geschrieben).toBe(ERSTBEFUELLUNG_FENSTER_TAGE - 1);
    expect(lauf.gescheitert).toBe(1);
    expect(geschrieben).not.toContain("2026-07-20");
    expect(kv.daten.has(fehlerKey("paul", "garmin"))).toBe(false);
  });

  it("setzt den Fehler-Marker, wenn kein einziger Tag durchkommt", async () => {
    const kv = fakeKv();
    const { archiv } = fakeArchiv();

    const { lauf } = await laufe(
      optionen({
        kv,
        archiv,
        fetchLive: async () => {
          throw new Error("429");
        },
      }),
    );

    expect(lauf).toMatchObject({ status: "gescheitert", geschrieben: 0 });
    const marker = JSON.parse(kv.daten.get(fehlerKey("paul", "garmin"))!);
    expect(marker.meldung).toContain("Garmin");
    expect(marker.meldung).not.toContain("429");
  });

  it("überlebt eine abgerissene Anmeldung und lässt sich danach wiederholen", async () => {
    const kv = fakeKv();
    const { archiv } = fakeArchiv();

    const { lauf } = await laufe(
      optionen({
        kv,
        archiv,
        buildClient: async () => {
          throw new Error("Refresh-Token abgelaufen");
        },
      }),
    );

    expect(lauf.status).toBe("gescheitert");
    expect(kv.daten.has(fehlerKey("paul", "garmin"))).toBe(true);
    // Die Sperre ist wieder offen — der Knopf funktioniert.
    expect((await laufe(optionen({ kv, archiv }))).gestartet).toBe(
      true,
    );
  });

  it("meldet nichts über die Verbindung, wenn gar nichts offen war", async () => {
    const kv = fakeKv({ [fehlerKey("paul", "garmin")]: '{"meldung":"alt","seit":"x"}' });
    const vorhanden = erstzubefuellendeTage({
      vorhanden: [],
      heute: "2026-08-06",
    }).map(tag);
    const { archiv, geschrieben } = fakeArchiv(vorhanden);

    const { lauf } = await laufe(optionen({ kv, archiv }));

    expect(lauf).toMatchObject({ status: "fertig", offen: 0, geschrieben: 0 });
    expect(geschrieben).toHaveLength(0);
    // Ein Lauf ohne Abruf sagt über die Verbindung nichts — der Marker bleibt.
    expect(kv.daten.has(fehlerKey("paul", "garmin"))).toBe(true);
  });
});

describe("offeneErstbefuellungsTage", () => {
  it("liefert leer, wenn das Fenster vollständig im Archiv steht", async () => {
    const { archiv } = fakeArchiv(
      erstzubefuellendeTage({ vorhanden: [], heute: "2026-08-06" }).map(tag),
    );

    expect(await offeneErstbefuellungsTage(archiv, "paul", "2026-08-06")).toEqual([]);
  });

  it("liefert die Lücken des Fensters", async () => {
    const { archiv } = fakeArchiv([tag("2026-08-05"), tag("2026-08-06")]);

    const offen = await offeneErstbefuellungsTage(archiv, "paul", "2026-08-06");

    expect(offen).toHaveLength(ERSTBEFUELLUNG_FENSTER_TAGE - 2);
    expect(offen).not.toContain("2026-08-06");
  });
});

describe("verschleppteTage", () => {
  it("lässt liegen, was der Cron selbst nachholt", () => {
    // Alles innerhalb des Nachlauffensters: Der nächtliche Lauf prüft diese Tage
    // ohnehin bei jedem Durchgang.
    expect(
      verschleppteTage(["2026-08-05", "2026-07-26", "2026-07-23"], "2026-08-06"),
    ).toEqual([]);
  });

  it("nennt die Tage jenseits des Nachlauffensters", () => {
    // `fensterStart` ist hier 2026-07-23 und gehört dem Cron noch; 2026-07-22 ist der
    // erste Tag, an den nur noch der Knopf des Athleten herankommt.
    expect(
      verschleppteTage(["2026-07-23", "2026-07-22", "2026-07-10"], "2026-08-06"),
    ).toEqual(["2026-07-22", "2026-07-10"]);
  });
});

describe("leseErstbefuellung", () => {
  it("liefert null ohne Eintrag und bei unlesbarem Eintrag", async () => {
    expect(await leseErstbefuellung(fakeKv(), "paul")).toBeNull();
    expect(
      await leseErstbefuellung(fakeKv({ [erstbefuellungKey("paul")]: "{" }), "paul"),
    ).toBeNull();
  });
});
