import { describe, it, expect } from "vitest";
import {
  buildSeedEntries,
  buildMcpUrl,
  generatePathSecret,
} from "./seeding.js";

/** Hilfsfunktion: Einträge als Map key→value für gezielte Assertions. */
function asMap(entries: { key: string; value: string }[]) {
  return new Map(entries.map((e) => [e.key, e.value]));
}

const input = {
  userId: "paul",
  pathSecret: "s3cret",
  finalSurge: { email: "paul@example.com", password: "fs-pw" },
  garmin: {
    di_token: "di-access",
    di_refresh_token: "di-refresh",
    di_client_id: "di-client",
    display_name: "paul.garmin",
  },
};

describe("buildSeedEntries", () => {
  it("bildet die userId auf genau die vier Per-Nutzer-KV-Einträge ab", () => {
    const entries = asMap(buildSeedEntries(input));

    expect(JSON.parse(entries.get("user:paul:finalsurge")!)).toEqual({
      email: "paul@example.com",
      password: "fs-pw",
    });
    expect(JSON.parse(entries.get("user:paul:garmin")!)).toEqual({
      di_token: "di-access",
      di_refresh_token: "di-refresh",
      di_client_id: "di-client",
    });
    expect(JSON.parse(entries.get("user:paul:garmin:profile")!)).toEqual({
      display_name: "paul.garmin",
    });
    expect(entries.get("pathsecret:s3cret")).toBe("paul");
  });

  it("schreibt kein Garmin-Passwort und vermischt die Kontexte nicht", () => {
    const garminWithSecret = {
      ...input,
      garmin: { ...input.garmin },
      finalSurge: { email: "paul@example.com", password: "geheim-fs" },
    };
    const entries = asMap(buildSeedEntries(garminWithSecret));

    const garminValue = entries.get("user:paul:garmin")!;
    // Der Worker bekommt nie das Garmin-Passwort: nur die drei Token-Felder.
    expect(Object.keys(JSON.parse(garminValue))).toEqual([
      "di_token",
      "di_refresh_token",
      "di_client_id",
    ]);
    // Das FS-Passwort darf nirgends im Garmin-Eintrag auftauchen.
    expect(garminValue).not.toContain("geheim-fs");
    // ...sondern ausschließlich unter dem FinalSurge-Key.
    expect(entries.get("user:paul:finalsurge")).toContain("geheim-fs");
  });
});

describe("buildMcpUrl", () => {
  it("setzt die fertige /{secret}/mcp-URL zusammen", () => {
    expect(
      buildMcpUrl("https://athlete-mcp.pauldiepold.workers.dev", "s3cret"),
    ).toBe("https://athlete-mcp.pauldiepold.workers.dev/s3cret/mcp");
  });

  it("toleriert einen Trailing-Slash in der Basis-URL", () => {
    expect(
      buildMcpUrl("https://athlete-mcp.pauldiepold.workers.dev/", "s3cret"),
    ).toBe("https://athlete-mcp.pauldiepold.workers.dev/s3cret/mcp");
  });
});

describe("generatePathSecret", () => {
  it("erzeugt ein hinreichend langes, URL-sicheres Secret", () => {
    const secret = generatePathSecret();
    // URL-sicher: nur Zeichen, die ohne Encoding in einem Pfadsegment stehen.
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
    // Genug Entropie, damit das Secret nicht erratbar ist.
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  it("liefert bei aufeinanderfolgenden Aufrufen unterschiedliche Secrets", () => {
    expect(generatePathSecret()).not.toBe(generatePathSecret());
  });
});
