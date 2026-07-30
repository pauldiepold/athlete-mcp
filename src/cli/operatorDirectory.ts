/**
 * Operator-Directory (Issue #15): listet die onboardeten Nutzer und löst pro
 * Nutzer das Pfad-Secret (MCP-Schreib-URL) und das View-Secret rückwärts auf
 * (`userId → Secret`), um die fertigen URLs zu bauen und die geseedeten Kontexte
 * zu melden.
 *
 * Sicherheitskritisch wie das Seeding (PRD-Testing-Decision): ein falsches
 * Reverse-Mapping würde einem Nutzer die URL eines anderen zuordnen. Deshalb rein
 * und mit Fake-KV testbar gekapselt — dieselbe Auflösung, die scripts/onboard.ts
 * (findExistingSecret) heute inline über wrangler macht, hier aber gegen ein
 * KV-Binding und in einem Durchlauf je Namespace statt einem Scan pro Nutzer.
 *
 * Rein lesend: keine Mutationen, kein Eingriff am MCP-Worker (ADR-0004). KV-Schema
 * siehe seeding.ts (buildSeedEntries) und docs/adr/0001/0003.
 */

import { buildMcpUrl, buildViewUrl } from "./seeding";

/** Welche Per-Nutzer-Kontexte im KV geseedet sind (Anzeige, nicht Auswertung). */
export interface SeededContexts {
  finalSurge: boolean;
  garmin: boolean;
  view: boolean;
}

export interface OnboardedUser {
  userId: string;
  /** Immer vorhanden: jeder onboardete Nutzer hat ein MCP-Pfad-Secret. */
  mcpUrl: string;
  /** null, wenn der Nutzer (noch) kein read-only View-Secret hat. */
  viewUrl: string | null;
  seededContexts: SeededContexts;
}

/** Alle Key-Namen eines Prefix über die KV-Pagination hinweg. */
async function listKeys(kv: KVNamespace, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await kv.list({ prefix, cursor });
    for (const { name } of res.keys) names.push(name);
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return names;
}

/**
 * Kehrt einen Secret-Namespace (`<prefix><secret> → userId`) um zu
 * `userId → secret`. Bei mehreren Secrets desselben Nutzers gewinnt das zuletzt
 * gelesene — im stabilen Seeding-Pfad existiert je Nutzer genau eines.
 */
async function resolveSecretsByUser(
  kv: KVNamespace,
  prefix: string,
): Promise<Map<string, string>> {
  const byUser = new Map<string, string>();
  for (const key of await listKeys(kv, prefix)) {
    const userId = await kv.get(key);
    if (userId) byUser.set(userId, key.slice(prefix.length));
  }
  return byUser;
}

/**
 * Die onboardeten Nutzer samt aufgelöster MCP-/View-URL und geseedeten Kontexten,
 * nach userId sortiert. Nutzer-Menge = alle mit Pfad-Secret (das MCP-Secret ist
 * der verbindliche Onboarding-Marker; ein Nutzer ohne es hätte keine MCP-URL).
 */
export async function listOnboardedUsers(
  kv: KVNamespace,
  baseUrl: string,
): Promise<OnboardedUser[]> {
  const pathSecrets = await resolveSecretsByUser(kv, "pathsecret:");
  const viewSecrets = await resolveSecretsByUser(kv, "viewsecret:");

  // Geseedete Per-Nutzer-Kontexte aus den `user:<id>:*`-Keys. `:garmin` matcht
  // nicht `:garmin:profile` (Anker auf $), analog zu listGarminUsers in index.ts.
  const finalSurgeUsers = new Set<string>();
  const garminUsers = new Set<string>();
  for (const key of await listKeys(kv, "user:")) {
    const fs = key.match(/^user:(.+):finalsurge$/);
    if (fs) finalSurgeUsers.add(fs[1]!);
    const gm = key.match(/^user:(.+):garmin$/);
    if (gm) garminUsers.add(gm[1]!);
  }

  const users: OnboardedUser[] = [];
  for (const [userId, pathSecret] of pathSecrets) {
    const viewSecret = viewSecrets.get(userId) ?? null;
    users.push({
      userId,
      mcpUrl: buildMcpUrl(baseUrl, pathSecret),
      viewUrl: viewSecret ? buildViewUrl(baseUrl, viewSecret) : null,
      seededContexts: {
        finalSurge: finalSurgeUsers.has(userId),
        garmin: garminUsers.has(userId),
        view: viewSecret !== null,
      },
    });
  }
  users.sort((a, b) => a.userId.localeCompare(b.userId));
  return users;
}
