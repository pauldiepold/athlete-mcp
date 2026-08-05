/**
 * Der eigene Browser-Link des Athleten, im Chat abfragbar: löst zur userId das
 * View-Secret rückwärts auf (`viewsecret:<secret> → userId`, KV) und baut daraus
 * die URLs der Browser-Fläche. Nach dem TenantResolver ist nur die userId bekannt —
 * das View-Secret liegt im KV bewusst in der anderen Richtung (ADR-0003), also wird
 * der Namespace gescannt. Bei einer Handvoll manuell onboardeter Nutzer
 * (ADR-0001) ist das ein kurzer Scan; ein zweiter, vorwärts gerichteter KV-Key
 * wäre eine zweite Wahrheit über dasselbe Mapping.
 *
 * Sicherheitskritisch wie Seeding und Operator-Directory: ein falsches Mapping
 * gäbe einem Nutzer den Link eines anderen — der Link *ist* die Anmeldung. Deshalb
 * rein und mit Fake-KV testbar gekapselt.
 *
 * Die Pfade unter dem Secret gehören der Browser-Fläche (ADR-0004): `/` ist das
 * Körperdaten-Dashboard, darunter liegen Steuerung und Tages-Detail. Seit ADR-0007
 * liegt sie auf derselben Origin wie der MCP-Endpunkt — `baseUrl` ist deshalb die
 * Origin des laufenden Requests und keine konfigurierte `WEB_BASE_URL` mehr.
 */

import { buildViewUrl } from "./cli/seeding.js";

export interface DashboardLinks {
  /** Startseite des per-User-Links: das Körperdaten-Dashboard. */
  dashboard: string;
  /** Die Steuerungs-Fläche (Steuerungsplan + Wochen, lesbar und editierbar). */
  steuerung: string;
  /** Tages-Detail; `YYYY-MM-DD` ist als Platzhalter zu ersetzen. */
  tagVorlage: string;
}

/** Das View-Secret eines Nutzers aus dem KV-Namespace; null, wenn er keines hat. */
async function findViewSecret(
  kv: KVNamespace,
  userId: string,
): Promise<string | null> {
  const prefix = "viewsecret:";
  let cursor: string | undefined;
  do {
    const res = await kv.list({ prefix, cursor });
    for (const { name } of res.keys) {
      if ((await kv.get(name)) === userId) {
        return name.slice(prefix.length);
      }
    }
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return null;
}

/**
 * Die Browser-Links des Nutzers; null, wenn für ihn kein View-Secret geseedet ist
 * (dann gibt es schlicht keine Fläche für ihn — kein Fehler, sondern ein Zustand).
 */
export async function resolveDashboardLinks(
  kv: KVNamespace,
  userId: string,
  baseUrl: string,
): Promise<DashboardLinks | null> {
  const viewSecret = await findViewSecret(kv, userId);
  if (!viewSecret) {
    return null;
  }

  const dashboard = buildViewUrl(baseUrl, viewSecret);
  return {
    dashboard,
    steuerung: `${dashboard}/steuerung`,
    tagVorlage: `${dashboard}/tag/YYYY-MM-DD`,
  };
}
