/**
 * Onboarding-CLI (Issue #8): provisioniert einen Nutzer einmalig lokal.
 *
 *   npm run onboard -- --user <name>
 *
 * Ablauf (HITL): Final-Surge-Creds erfragen + verifizieren → Garmin-Seed-Login
 * (Passwort + MFA über den garth-Helper) → Pfad-Secret bestimmen (vorhandenes
 * wiederverwenden, sonst neu) → alle Per-Nutzer-KV-Einträge via `npx wrangler`
 * schreiben → fertige `/{secret}/mcp`-URL ausgeben.
 *
 * Die sicherheitskritische Auflösung (userId → KV-Einträge, Token-Mapping) liegt
 * testbar in src/cli/seeding.ts. Dieser Orchestrator ist reine, ungetestete
 * Verdrahtung von Prompts, Subprozessen und Side-Effects (Issue: MFA-Login ist
 * naturgemäß HITL). Re-Seed eines bestehenden Nutzers stellt einen abgerissenen
 * Refresh-Token wieder her (KV-put = Upsert) — ohne Code-Änderung.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline";

import {
  buildSeedEntries,
  buildMcpUrl,
  generatePathSecret,
} from "../src/cli/seeding.js";
import type { GarminSeed } from "../src/cli/seeding.js";
import { login } from "../src/finalsurge/finalSurgeClient.js";

const DEFAULT_BASE_URL = "https://athlete-mcp.pauldiepold.workers.dev";

/** Fortschritt/Hinweise auf stderr, damit stdout nur die fertige URL trägt. */
function log(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

function die(msg: string): never {
  log(`Fehler: ${msg}`);
  process.exit(1);
}

/** Minimales `--flag value`-Parsing; nur was dieses CLI braucht. */
function parseArgs(argv: string[]): { user: string; baseUrl: string } {
  let user: string | undefined;
  let baseUrl = DEFAULT_BASE_URL;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user") user = argv[++i];
    else if (argv[i] === "--base-url") baseUrl = argv[++i]!;
  }
  if (!user) die("--user <name> ist erforderlich");
  return { user, baseUrl };
}

/** Sichtbarer Prompt (Email o. Ä.). */
function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

/** Verdeckter Prompt (Passwort): Eingabe wird nicht zurückgeschrieben. */
function askHidden(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const asMutable = rl as unknown as { _writeToOutput: (s: string) => void };
  const original = asMutable._writeToOutput.bind(rl);
  asMutable._writeToOutput = (s: string) => {
    // Nur die Frage selbst durchlassen, getippte Zeichen unterdrücken.
    if (s.includes(question)) original(s);
  };
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      process.stderr.write("\n");
      resolve(answer.trim());
    }),
  );
}

/** Ruft `npx wrangler` auf die Produktions-KV (Binding aus wrangler.jsonc). */
function wrangler(args: string[], stdio: "pipe" | "inherit" = "pipe"): string {
  return execFileSync(
    "npx",
    ["wrangler", "kv", ...args, "--binding", "SESSION_KV", "--remote"],
    { encoding: "utf8", stdio: stdio === "inherit" ? "inherit" : ["ignore", "pipe", "inherit"] },
  );
}

/**
 * Sucht ein bereits vergebenes Pfad-Secret für die userId, damit ein Re-Seed die
 * MCP-URL des Nutzers nicht ändert. Scan über `pathsecret:*` (wenige Nutzer).
 */
function findExistingSecret(userId: string): string | null {
  const listed = wrangler(["key", "list", "--prefix", "pathsecret:"]);
  const keys = JSON.parse(listed) as { name: string }[];
  for (const { name } of keys) {
    const value = wrangler(["key", "get", name]).trim();
    if (value === userId) return name.replace(/^pathsecret:/, "");
  }
  return null;
}

async function main(): Promise<void> {
  const { user: userId, baseUrl } = parseArgs(process.argv.slice(2));
  log(`== Onboarding für Nutzer "${userId}" ==`);

  // --- Final Surge: Creds erfragen und durch einen echten Login verifizieren ---
  const fsEmail = process.env.FINALSURGE_EMAIL || (await ask("Final-Surge Email: "));
  const fsPassword =
    process.env.FINALSURGE_PASSWORD || (await askHidden("Final-Surge Passwort: "));
  log(">> Verifiziere Final-Surge-Login …");
  try {
    await login(fsEmail, fsPassword);
  } catch (err) {
    die(`Final-Surge-Login fehlgeschlagen: ${(err as Error).message}`);
  }
  log(">> Final-Surge-Login ok.");

  // --- Garmin: Seed-Login (Passwort + MFA) über den garth-Helper ---
  log(">> Starte Garmin-Seed-Login (interaktiv: Passwort + MFA-Code) …");
  let garthJson: string;
  try {
    garthJson = execFileSync("uv", ["run", "scripts/seed_garmin_login.py"], {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    });
  } catch {
    die("Garmin-Seed-Login abgebrochen oder fehlgeschlagen.");
  }
  // Der Helper (garminconnect) liefert das DI-Bündel bereits in Zielform.
  const garmin = JSON.parse(garthJson) as GarminSeed;
  for (const field of [
    "di_token",
    "di_refresh_token",
    "di_client_id",
    "display_name",
  ] as const) {
    if (!garmin[field]) die(`Garmin-Seed-Login ohne ${field}.`);
  }

  // --- Pfad-Secret: vorhandenes wiederverwenden, sonst neu (stabile URL) ---
  const existing = findExistingSecret(userId);
  const pathSecret = existing ?? generatePathSecret();
  log(existing ? ">> Re-Seed: bestehendes Pfad-Secret wiederverwendet." : ">> Neues Pfad-Secret erzeugt.");

  // --- KV schreiben: eine Bulk-Invocation, Secrets in temporärer Datei (nicht in argv) ---
  const entries = buildSeedEntries({
    userId,
    pathSecret,
    finalSurge: { email: fsEmail, password: fsPassword },
    garmin,
  });
  const dir = mkdtempSync(join(tmpdir(), "athlete-seed-"));
  const file = join(dir, "kv.json");
  try {
    writeFileSync(file, JSON.stringify(entries), { mode: 0o600 });
    log(">> Schreibe KV-Einträge via wrangler …");
    wrangler(["bulk", "put", file], "inherit");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // --- Ergebnis: die fertige MCP-URL (einzige Ausgabe auf stdout) ---
  log(">> Fertig. MCP-URL:");
  process.stdout.write(`${buildMcpUrl(baseUrl, pathSecret)}\n`);
}

main().catch((err) => die((err as Error).message));
