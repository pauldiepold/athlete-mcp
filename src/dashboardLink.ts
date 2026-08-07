/**
 * Die Browser-Links des Athleten, im Chat abfragbar.
 *
 * Bis ADR-0007 war das eine Auflösung: Zur `userId` wurde das View-Secret rückwärts
 * aus dem KV gesucht, weil der Link *war* die Anmeldung — jeder Athlet hatte einen
 * anderen, und ein falsches Mapping hätte einem Athleten den Link eines anderen
 * gegeben. Mit der Anmeldung per Identität ist von dieser Sorgfalt nichts mehr übrig:
 * Die Flächen liegen für alle unter denselben Pfaden, und wer sie sieht, entscheidet
 * die Session. Aus einem sicherheitskritischen Lookup ist eine Zeichenkette geworden.
 *
 * Was bleibt, ist der eine Ort für diese Pfade — sie stehen hier und nicht verstreut
 * in Tool-Beschreibungen. Die Pfade selbst gehören der Browser-Fläche (ADR-0004): `/`
 * ist seit Issue #60 die **Startseite** (Hinweis + aktueller Stand), die Verläufe
 * liegen unter `/dashboard`, daneben Steuerung und Tages-Detail.
 *
 * `baseUrl` ist die Origin des laufenden Requests: Seit ADR-0007 liegt die
 * Weboberfläche auf derselben Origin wie der MCP-Endpunkt, eine konfigurierte
 * `WEB_BASE_URL` gibt es nicht mehr.
 */

export interface DashboardLinks {
  /**
   * Die **Startseite** (Issue #60): der aktuelle Stand der Körperdaten und ein
   * Hinweis, was sich gerade im Chat lohnt. Der Ort, auf den man einen Athleten
   * schickt, wenn man ihn nirgendwo Bestimmtes hinschickt.
   */
  start: string;
  /**
   * Die Körperdaten-**Verläufe** — Charts über den gewählten Zeitraum, Wochen-Sicht,
   * Körperdaten-Index. Lagen bis Issue #60 auf `/`; seither eine eigene Fläche, weil
   * die Startseite in den Chat weisen soll und nicht in ein Chart.
   */
  dashboard: string;
  /** Die Steuerungs-Fläche (Steuerungsplan + Wochen, lesbar und editierbar). */
  steuerung: string;
  /** Tages-Detail; `YYYY-MM-DD` ist als Platzhalter zu ersetzen. */
  tagVorlage: string;
  /**
   * Die Einstellungen — Profil und **Verbindungen** zu den Datenquellen (Issue #44).
   *
   * Der Grund, warum dieser Link mit hier steht: Fehlt eine Verbindung, antwortet das
   * betroffene Tool fachlich mit genau dieser Adresse, damit Claude sie weiterreichen
   * kann. Ein Athlet, der im Chat merkt, dass Garmin fehlt, soll dort weiterkommen und
   * nicht erst die Oberfläche durchsuchen.
   */
  einrichtung: string;
}

/** Die Browser-Links unter einer Origin. */
export function buildDashboardLinks(baseUrl: string): DashboardLinks {
  const basis = baseUrl.replace(/\/+$/, "");
  return {
    start: `${basis}/`,
    dashboard: `${basis}/dashboard`,
    steuerung: `${basis}/steuerung`,
    tagVorlage: `${basis}/tag/YYYY-MM-DD`,
    einrichtung: `${basis}/einstellungen`,
  };
}
