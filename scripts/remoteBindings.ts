/**
 * Produktions-Bindings für lokale CLIs: dünne Adapter, die die echte KV und die
 * echte D1 über `npx wrangler` ansprechbar machen, damit die Worker-Module
 * (`GarminAuth`, `KoerperdatenArchive`) in einem Node-Skript **unverändert**
 * laufen. Ohne sie müsste ein CLI Token-Refresh und Archiv-SQL nachbauen — der
 * Sonderpfad, den ADR-0002 ausdrücklich vermeiden will.
 *
 * Nachgebildet wird nur der Ausschnitt, den diese Module tatsächlich benutzen;
 * der Cast auf `KVNamespace`/`D1Database` an der Grenze macht das explizit.
 * Voraussetzung wie beim Onboarding-CLI: `npx wrangler login`.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

/** Ein wrangler-Aufruf; stdout kommt zurück, stderr wird für die Fehlerprüfung mitgelesen. */
function wrangler(args: string[]): string {
  return execFileSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Der 404-Fall von `kv key get` — ein fehlender Key ist kein Fehler, sondern `null`. */
function istNichtGefunden(err: unknown): boolean {
  const stderr = (err as { stderr?: string }).stderr ?? "";
  return stderr.includes("404: Not Found");
}

/**
 * KV-Ausschnitt für `GarminAuth`: `get(key, "json")` und `put`. Gelesene Werte
 * werden im Prozess gecacht — ein Backfill über hundert Tage würde das
 * Token-Bündel sonst hundertmal über einen wrangler-Subprozess holen. `put`
 * hält den Cache aktuell, damit ein Token-Refresh mitten im Lauf greift.
 */
class RemoteKv {
  private readonly cache = new Map<string, string | null>();

  constructor(private readonly binding: string) {}

  async get(key: string, type?: "text" | "json"): Promise<unknown> {
    const raw = this.read(key);
    if (raw === null) return null;
    return type === "json" ? JSON.parse(raw) : raw;
  }

  async put(key: string, value: string): Promise<void> {
    // Wert über eine temporäre Datei statt über argv: hier stehen Garmin-Tokens
    // drin, die in keiner Prozessliste auftauchen sollen (wie in onboard.ts).
    const dir = mkdtempSync(join(tmpdir(), "athlete-kv-"));
    const file = join(dir, "kv.json");
    try {
      writeFileSync(file, JSON.stringify([{ key, value }]), { mode: 0o600 });
      wrangler(["kv", "bulk", "put", file, "--binding", this.binding, "--remote"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    this.cache.set(key, value);
  }

  private read(key: string): string | null {
    const gecacht = this.cache.get(key);
    if (gecacht !== undefined) return gecacht;

    let value: string | null;
    try {
      value = wrangler([
        "kv",
        "key",
        "get",
        key,
        "--binding",
        this.binding,
        "--remote",
        "--text",
      ]).replace(/\n$/, "");
    } catch (err) {
      if (!istNichtGefunden(err)) throw err;
      value = null;
    }
    this.cache.set(key, value);
    return value;
  }
}

/**
 * Setzt gebundene Parameter als SQL-Literale ein — die wrangler-CLI kennt keine
 * Bindings. Trägt die Anweisung selbst ein `?` in einem String-Literal, wäre die
 * Ersetzung falsch; die Abfragen des Archivs tun das nicht.
 */
function inlineParams(sql: string, params: unknown[]): string {
  let i = 0;
  const inlined = sql.replace(/\?/g, () => {
    if (i >= params.length) {
      throw new Error(`Zu wenige Parameter für: ${sql}`);
    }
    return literal(params[i++]);
  });
  if (i !== params.length) {
    throw new Error(`${params.length - i} Parameter zu viel für: ${sql}`);
  }
  return inlined;
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Kein SQL-Literal: ${value}`);
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Ein vorbereitetes Statement; `bind` liefert eine neue Instanz mit Parametern. */
class RemoteD1Statement {
  constructor(
    private readonly database: string,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): RemoteD1Statement {
    return new RemoteD1Statement(this.database, this.sql, params);
  }

  async first<T>(): Promise<T | null> {
    return (this.execute()[0] as T) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: boolean }> {
    return { results: this.execute() as T[], success: true };
  }

  async run(): Promise<{ success: boolean }> {
    this.execute();
    return { success: true };
  }

  private execute(): Record<string, unknown>[] {
    const stdout = wrangler([
      "d1",
      "execute",
      this.database,
      "--remote",
      "--json",
      "-y",
      "--command",
      inlineParams(this.sql, this.params),
    ]);
    const antwort = JSON.parse(stdout) as {
      results?: Record<string, unknown>[];
    }[];
    return antwort[0]?.results ?? [];
  }
}

class RemoteD1 {
  constructor(private readonly database: string) {}

  prepare(sql: string): RemoteD1Statement {
    return new RemoteD1Statement(this.database, sql);
  }
}

/** Die echte SESSION_KV, als `KVNamespace` verwendbar. */
export function remoteKv(binding = "SESSION_KV"): KVNamespace {
  return new RemoteKv(binding) as unknown as KVNamespace;
}

/** Die echte ATHLETE_DB, als `D1Database` verwendbar. */
export function remoteD1(binding = "ATHLETE_DB"): D1Database {
  return new RemoteD1(binding) as unknown as D1Database;
}
