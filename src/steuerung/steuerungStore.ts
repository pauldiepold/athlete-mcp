/**
 * Tiefes Modul: D1-gestützter Steuerungs-Store — das erste eigene Write-Modell
 * des Workers (kein externer Connector). Versteckt das Schema und legt rohes
 * Markdown per user_id ab: ein Steuerungsplan + ein Eintrag pro ISO-Woche.
 * Single-Writer (nur der Agent) → Whole-Object-Overwrite, keine Schutzlogik.
 *
 * get-Methoden liefern bei Nichtexistenz leer ("" bzw. []), damit der Agent den
 * "noch nichts da → anlegen"-Fall ohne Error-Handling erkennt. `kw` wird streng
 * validiert (^\d{4}-W\d{2}$), weil der Wert als Primary-Key in die Sortierung von
 * listWochen eingeht — ein abweichendes Format verteilte Wochen still inkonsistent.
 *
 * Schema: migrations/0002_steuerung.sql. Siehe ADR-0002 (steuerung-eigenes-write-modell-in-d1).
 */

const KW_PATTERN = /^\d{4}-W\d{2}$/;

/** True, wenn `kw` dem sortierbaren ISO-Format YYYY-Www entspricht. */
export function isValidKw(kw: string): boolean {
  return KW_PATTERN.test(kw);
}

/** Wirft bei abweichendem `kw`-Format (Invariante der listWochen-Sortierung). */
export function assertValidKw(kw: string): void {
  if (!isValidKw(kw)) {
    throw new Error(
      `Ungültige kw "${kw}": erwartet ISO-Format YYYY-Www (z. B. 2026-W25).`,
    );
  }
}

export class SteuerungStore {
  constructor(private readonly db: D1Database) {}

  /** Der Steuerungsplan des Nutzers ("" wenn noch keiner gesetzt). */
  async getPlan(userId: string): Promise<string> {
    const row = await this.db
      .prepare("SELECT content FROM steuerungsplan WHERE user_id = ?")
      .bind(userId)
      .first<{ content: string }>();
    return row?.content ?? "";
  }

  /** Schreibt/überschreibt den gesamten Steuerungsplan (Upsert auf user_id). */
  async setPlan(userId: string, content: string): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO steuerungsplan (user_id, content) VALUES (?, ?) " +
          "ON CONFLICT(user_id) DO UPDATE SET content = excluded.content",
      )
      .bind(userId, content)
      .run();
  }

  /** Vorhandene Wochen-Keys des Nutzers, aufsteigend ([] wenn keine). */
  async listWochen(userId: string): Promise<string[]> {
    const { results } = await this.db
      .prepare(
        "SELECT kw FROM steuerung_woche WHERE user_id = ? ORDER BY kw",
      )
      .bind(userId)
      .all<{ kw: string }>();
    return results.map((r) => r.kw);
  }

  /** Eine Woche ("" wenn die kw noch nicht existiert). */
  async getWoche(userId: string, kw: string): Promise<string> {
    assertValidKw(kw);
    const row = await this.db
      .prepare("SELECT content FROM steuerung_woche WHERE user_id = ? AND kw = ?")
      .bind(userId, kw)
      .first<{ content: string }>();
    return row?.content ?? "";
  }

  /** Schreibt/überschreibt eine Woche komplett (Upsert auf (user_id, kw)). */
  async setWoche(userId: string, kw: string, content: string): Promise<void> {
    assertValidKw(kw);
    await this.db
      .prepare(
        "INSERT INTO steuerung_woche (user_id, kw, content) VALUES (?, ?, ?) " +
          "ON CONFLICT(user_id, kw) DO UPDATE SET content = excluded.content",
      )
      .bind(userId, kw, content)
      .run();
  }
}
