import { describe, it, expect } from "vitest";

import {
  legeMfaZustandAb,
  loeseMfaZustandEin,
  MFA_TTL_SEKUNDEN,
} from "./garminMfaSpeicher.js";
import type { MfaZustand } from "./garminSsoLogin.js";

const ZUSTAND: MfaZustand = {
  cookies: { SESSIONID: "abc", GARMIN_SSO: "def" },
  csrf: "99BB77DD-CSRF-MFA-FRISCH",
  referer: "https://sso.garmin.com/sso/signin?id=gauth-widget",
};

function fakeKv() {
  const daten = new Map<string, { wert: string; ttl?: number }>();
  const kv = {
    async get(key: string) {
      return daten.get(key)?.wert ?? null;
    },
    async put(key: string, wert: string, opts?: { expirationTtl?: number }) {
      daten.set(key, { wert, ttl: opts?.expirationTtl });
    },
    async delete(key: string) {
      daten.delete(key);
    },
  };
  return { kv: kv as unknown as KVNamespace, daten };
}

describe("Garmin-MFA-Zwischenzustand", () => {
  it("gibt den abgelegten Zustand gegen den Handle wieder heraus", async () => {
    const { kv } = fakeKv();
    const handle = await legeMfaZustandAb(kv, "paul", ZUSTAND);

    expect(await loeseMfaZustandEin(kv, "paul", handle)).toEqual(ZUSTAND);
  });

  it("löscht ihn beim Einlösen — ein zweiter Versuch findet nichts mehr", async () => {
    const { kv, daten } = fakeKv();
    const handle = await legeMfaZustandAb(kv, "paul", ZUSTAND);

    await loeseMfaZustandEin(kv, "paul", handle);

    expect(daten.size).toBe(0);
    expect(await loeseMfaZustandEin(kv, "paul", handle)).toBeNull();
  });

  it("gibt ihn keinem anderen Konto heraus", async () => {
    const { kv } = fakeKv();
    const handle = await legeMfaZustandAb(kv, "paul", ZUSTAND);

    expect(await loeseMfaZustandEin(kv, "jonas", handle)).toBeNull();
  });

  it("liefert null für einen unbekannten und für einen leeren Handle", async () => {
    const { kv } = fakeKv();

    expect(await loeseMfaZustandEin(kv, "paul", "gibt-es-nicht")).toBeNull();
    expect(await loeseMfaZustandEin(kv, "paul", "")).toBeNull();
  });

  it("legt ihn kurzlebig ab und unter einem opaken, nicht erratbaren Handle", async () => {
    const { kv, daten } = fakeKv();

    const handle = await legeMfaZustandAb(kv, "paul", ZUSTAND);

    expect(daten.get(`garmin:mfa:${handle}`)?.ttl).toBe(MFA_TTL_SEKUNDEN);
    expect(handle).toHaveLength(32);
    expect(handle).not.toContain("paul");
  });

  it("trägt keine Zugangsdaten mit — Auflage aus Spike #38", async () => {
    const { kv, daten } = fakeKv();

    await legeMfaZustandAb(kv, "paul", ZUSTAND);

    const [eintrag] = [...daten.values()];
    expect(Object.keys(JSON.parse(eintrag!.wert).zustand)).toEqual([
      "cookies",
      "csrf",
      "referer",
    ]);
  });

  it("übersteht einen unlesbaren Eintrag, ohne zu werfen", async () => {
    const { kv } = fakeKv();
    await kv.put("garmin:mfa:kaputt", "kein JSON");

    expect(await loeseMfaZustandEin(kv, "paul", "kaputt")).toBeNull();
  });
});
