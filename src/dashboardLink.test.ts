import { describe, it, expect } from "vitest";
import { buildDashboardLinks } from "./dashboardLink.js";

const BASIS = "https://training.pauldiepold.de";

describe("buildDashboardLinks", () => {
  it("baut die drei Links der Browser-Fläche unter der Origin", () => {
    expect(buildDashboardLinks(BASIS)).toEqual({
      dashboard: `${BASIS}/`,
      steuerung: `${BASIS}/steuerung`,
      tagVorlage: `${BASIS}/tag/YYYY-MM-DD`,
    });
  });

  it("normalisiert Schrägstriche am Ende der Basis-URL", () => {
    expect(buildDashboardLinks(`${BASIS}//`)).toEqual(buildDashboardLinks(BASIS));
  });

  it("enthält kein Secret mehr — die Links sind für alle Athleten gleich", () => {
    // Seit ADR-0007 ist der Link keine Anmeldung mehr; wer welche Daten sieht,
    // entscheidet die Session. Genau deshalb hängen sie nicht mehr an der userId.
    const links = buildDashboardLinks(BASIS);

    expect(Object.values(links).every((url) => url.startsWith(`${BASIS}/`))).toBe(true);
    expect(links.dashboard).not.toContain("secret");
  });
});
