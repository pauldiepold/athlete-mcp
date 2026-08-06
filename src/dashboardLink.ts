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
 * ist das Körperdaten-Dashboard, darunter liegen Steuerung und Tages-Detail.
 *
 * `baseUrl` ist die Origin des laufenden Requests: Seit ADR-0007 liegt die
 * Weboberfläche auf derselben Origin wie der MCP-Endpunkt, eine konfigurierte
 * `WEB_BASE_URL` gibt es nicht mehr.
 */

export interface DashboardLinks {
  /** Startseite: das Körperdaten-Dashboard. */
  dashboard: string;
  /** Die Steuerungs-Fläche (Steuerungsplan + Wochen, lesbar und editierbar). */
  steuerung: string;
  /** Tages-Detail; `YYYY-MM-DD` ist als Platzhalter zu ersetzen. */
  tagVorlage: string;
}

/** Die Browser-Links unter einer Origin. */
export function buildDashboardLinks(baseUrl: string): DashboardLinks {
  const basis = baseUrl.replace(/\/+$/, "");
  return {
    dashboard: `${basis}/`,
    steuerung: `${basis}/steuerung`,
    tagVorlage: `${basis}/tag/YYYY-MM-DD`,
  };
}
