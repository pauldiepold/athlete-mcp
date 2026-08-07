import { describe, it, expect } from "vitest";
import { buildDashboardLinks } from "./dashboardLink.js";

const BASIS = "https://training.pauldiepold.de";

describe("buildDashboardLinks", () => {
  it("baut die Links der Browser-Fläche unter der Origin", () => {
    expect(buildDashboardLinks(BASIS)).toEqual({
      start: `${BASIS}/`,
      dashboard: `${BASIS}/dashboard`,
      steuerung: `${BASIS}/steuerung`,
      tagVorlage: `${BASIS}/tag/YYYY-MM-DD`,
      einrichtung: `${BASIS}/einstellungen`,
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

  it("trennt Startseite und Verläufe (Issue #60)", () => {
    // Die beiden waren bis #60 dieselbe Adresse. Sie auseinanderzuhalten ist der
    // ganze Zweck des neuen Feldes: Claude soll den Athleten zum Einstieg auf `/`
    // schicken und nur dann auf die Charts, wenn es um die Charts geht.
    const links = buildDashboardLinks(BASIS);

    expect(links.start).not.toBe(links.dashboard);
  });
});
