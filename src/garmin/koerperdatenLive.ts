/**
 * Der Live-Pfad zu Garmin, an einer Stelle: aus dem KV-Token-Bündel eines
 * Nutzers einen GarminClient bauen und damit die Körperdaten eines Tages roh
 * holen und in die schlanke Form bringen.
 *
 * Bewusst ein eigenes Modul statt privater Funktionen in der Server-Shell: es
 * gibt drei Aufrufer — MCP-Tool, Cron und das lokale Backfill-CLI. Ein zweiter,
 * nachgebauter Pfad im CLI würde beim nächsten Formatwechsel vergessen; genau
 * davor warnt ADR-0002 (koerperdaten-intraday-ereignisbasiert).
 */

import { formatKoerperdaten } from "./formatKoerperdaten.js";
import type { Koerperdaten } from "./formatKoerperdaten.js";
import { GarminAuth, refreshTokens } from "./garminAuth.js";
import { GarminClient } from "./garminClient.js";

/** Baut den GarminClient eines Nutzers (per-user Token-Bündel + displayName aus dem KV). */
export async function buildGarminClient(
  kv: KVNamespace,
  userId: string,
): Promise<GarminClient> {
  const profile = (await kv.get(`user:${userId}:garmin:profile`, "json")) as {
    display_name?: string;
  } | null;
  const auth = new GarminAuth(kv, userId, refreshTokens);
  return new GarminClient(auth, profile?.display_name ?? "");
}

/** Roh holen → schlanke Form. Die eine Stelle, an der aus Garmin Körperdaten werden. */
export async function fetchKoerperdatenLive(
  client: GarminClient,
  date: string,
): Promise<Koerperdaten> {
  const raw = await client.getKoerperdaten(date);
  return formatKoerperdaten(
    date,
    raw.hrv,
    raw.sleep,
    raw.stress,
    raw.bodyBattery,
    raw.trainingReadiness,
  );
}
