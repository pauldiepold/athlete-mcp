/**
 * Reiner Kern des Onboarding-CLI: bildet die pro Nutzer gesammelten Creds/Tokens
 * auf die exakten KV-Einträge ab (Bulk-Format für `wrangler kv bulk put`).
 *
 * Sicherheitskritisch (PRD-Testing-Decision): ein falsches Mapping würde
 * stillschweigend fremde Daten ausliefern — deshalb ist genau diese Auflösung
 * testbar gekapselt. Der interaktive MFA-Login und das wrangler-Schreiben selbst
 * sind HITL/Side-Effects und liegen im Orchestrator (scripts/onboard.ts).
 *
 * KV-Schema siehe CONTEXT-MAP.md und ADR-0001 (athlete-mcp-ein-worker-mehrere-kontexte).
 * Bewusst nur Web-APIs (crypto/atob), damit das Modul ohne @types/node neben dem
 * Worker-Code typecheckt; läuft in Node (CLI) wie im Worker.
 */

/** base64url-Encoding einer Byte-Folge (ohne Padding), URL-pfadsicher. */
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Erzeugt ein nicht erratbares, URL-sicheres Secret (24 Zufallsbytes →
 * 32 base64url-Zeichen). Identifiziert den Nutzer in einer URL (MCP-Pfad-Secret
 * oder read-only View-Secret) — die einzige Mandantentrennung; daher
 * kryptografische Zufälligkeit.
 */
export function generatePathSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** Die fertige, an den Nutzer ausgegebene MCP-URL: `<base>/{secret}/mcp`. */
export function buildMcpUrl(baseUrl: string, pathSecret: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${pathSecret}/mcp`;
}

/** Die fertige read-only Browser-URL der Steuerung: `<base>/{secret}/steuerung`. */
export function buildViewUrl(baseUrl: string, viewSecret: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${viewSecret}/steuerung`;
}

/** Ein KV-Eintrag im `wrangler kv bulk put`-Format. */
export interface KvEntry {
  key: string;
  value: string;
}

/** Das schlanke Garmin-DI-Token-Bündel plus der für die API nötige displayName. */
export interface GarminSeed {
  di_token: string;
  di_refresh_token: string;
  di_client_id: string;
  display_name: string;
}

export interface SeedInput {
  userId: string;
  pathSecret: string;
  viewSecret: string;
  finalSurge: { email: string; password: string };
  garmin: GarminSeed;
}

/**
 * Erzeugt die fünf Per-Nutzer-KV-Einträge. Bewusst explizit pro Feld, damit kein
 * Garmin-Passwort und keine Quervermischung in einen falschen Key gelangt. Das
 * View-Secret (`viewsecret:`) liegt in einem eigenen Namespace, getrennt vom
 * MCP-Schreib-Secret (`pathsecret:`) — siehe ADR-0003.
 */
export function buildSeedEntries(input: SeedInput): KvEntry[] {
  const { userId, pathSecret, viewSecret, finalSurge, garmin } = input;
  return [
    {
      key: `user:${userId}:finalsurge`,
      value: JSON.stringify({
        email: finalSurge.email,
        password: finalSurge.password,
      }),
    },
    {
      key: `user:${userId}:garmin`,
      value: JSON.stringify({
        di_token: garmin.di_token,
        di_refresh_token: garmin.di_refresh_token,
        di_client_id: garmin.di_client_id,
      }),
    },
    {
      key: `user:${userId}:garmin:profile`,
      value: JSON.stringify({ display_name: garmin.display_name }),
    },
    {
      key: `pathsecret:${pathSecret}`,
      value: userId,
    },
    {
      key: `viewsecret:${viewSecret}`,
      value: userId,
    },
  ];
}
