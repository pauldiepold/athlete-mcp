/**
 * Tiefes Modul: D1-gestütztes Körperdaten-Archiv (die Quelle der Historie im
 * archive-first-Modell). Versteckt das Schema und legt die schlanke
 * formatKoerperdaten-Form als JSON-Blob pro (user_id, date) ab — so bleibt die
 * Body-Daten-Form über das D1-Roundtrip identisch zur Live-Form (#6). Implementiert
 * KoerperdatenStore, gegen das die Read-through-Orchestrierung läuft.
 *
 * Schema: migrations/0001_koerperdaten.sql. Siehe ADR-0001
 * (koerperdaten-live-api-archive-first). Integrationsebene — kein Unit-Test.
 */

import type { Koerperdaten } from "./formatKoerperdaten.js";
import type { KoerperdatenStore } from "./koerperdatenReadThrough.js";

export class KoerperdatenArchive implements KoerperdatenStore {
  constructor(private readonly db: D1Database) {}

  /** Ein Tag aus dem Archiv (null, wenn nicht vorhanden). */
  async read(userId: string, date: string): Promise<Koerperdaten | null> {
    const row = await this.db
      .prepare("SELECT data FROM koerperdaten WHERE user_id = ? AND date = ?")
      .bind(userId, date)
      .first<{ data: string }>();
    return row ? (JSON.parse(row.data) as Koerperdaten) : null;
  }

  /** Vorhandene Tage in [start, end] (inklusive), nach Datum aufsteigend. */
  async readRange(
    userId: string,
    start: string,
    end: string,
  ): Promise<Koerperdaten[]> {
    const { results } = await this.db
      .prepare(
        "SELECT data FROM koerperdaten WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date",
      )
      .bind(userId, start, end)
      .all<{ data: string }>();
    return results.map((r) => JSON.parse(r.data) as Koerperdaten);
  }

  /** Schreibt/überschreibt einen Tag (Upsert auf dem (user_id, date)-Schlüssel). */
  async upsert(
    userId: string,
    date: string,
    daten: Koerperdaten,
  ): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO koerperdaten (user_id, date, data) VALUES (?, ?, ?) " +
          "ON CONFLICT(user_id, date) DO UPDATE SET data = excluded.data",
      )
      .bind(userId, date, JSON.stringify(daten))
      .run();
  }
}
