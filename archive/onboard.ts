/**
 * ARCHIV — nicht mehr aufgerufen, nicht mehr gepflegt, nicht typgeprüft.
 *
 * Das Onboarding-CLI (Issue #8) provisionierte einen Athleten einmalig lokal: Der
 * Operator tippte fremde Zugangsdaten in seine eigene Konsole und gab am Ende zwei
 * Geheim-URLs heraus. Mit [ADR-0007](../docs/adr/0007-oauth-identitaet-statt-url-secrets-ein-deployable.md)
 * ist beides weg — ein Konto entsteht über einen Invite-Code aus `/admin`, die
 * Verbindungen zu Final Surge und Garmin richtet der Athlet unter `/einstellungen`
 * selbst ein.
 *
 * Warum es trotzdem hier liegt und nicht gelöscht ist: Der **interaktive Garmin-Login
 * mit MFA** ist der einzige Ort im Repo, an dem dieser Weg über `garminconnect` läuft
 * (`seed_garmin_login.py` daneben). Dreht Garmin seinen Login-Pfad, ist das die
 * Recherche-Grundlage, um den neuen zu finden — die Bibliothek zieht dann nach, unser
 * eigener Widget-Flow (`src/garmin/garminSsoLogin.ts`) nicht.
 *
 * Beim Archivieren (Issue #46) sind die **Pfad-/View-Secrets** herausgefallen: Sie
 * schließen nichts mehr auf, ihre KV-Einträge werden abgeräumt, und ein Skript, das
 * tote Schlüssel schreibt, ist eine Falle. Übrig ist der Weg, wie ein Garmin-Bündel und
 * Final-Surge-Zugangsdaten in die KV kommen. Auch das ist Referenz, kein Betriebsmittel.
 *
 * Der ursprüngliche Ablauf: Final-Surge-Creds erfragen + verifizieren → Garmin-Seed-Login
 * (Passwort + MFA über den garth-Helper) → Per-Athleten-KV-Einträge via `npx wrangler`
 * schreiben. Reine, ungetestete Verdrahtung von Prompts, Subprozessen und Side-Effects;
 * ein MFA-Login ist naturgemäß HITL.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline";

import { login } from "../src/finalsurge/finalSurgeClient.js";

/**
 * Die Umgebung, in die ein Lauf schreibt: `wrangler.jsonc` bestimmt das Ziel-KV.
 * Bewusst eine Konstante und nie ein Flag gewesen — ein Flag hätte nur die *ausgegebene*
 * URL verstellt, nicht das Ziel; ein Aufruf „für die Produktion" hätte still in die
 * Testumgebung geseedet.
 */
const WRANGLER_CONFIG = "web/wrangler.jsonc";

/** Das schlanke Garmin-DI-Token-Bündel plus der für die API nötige displayName. */
interface GarminSeed {
  di_token: string;
  di_refresh_token: string;
  di_client_id: string;
  display_name: string;
}

/** Ein KV-Eintrag im `wrangler kv bulk put`-Format. */
interface KvEntry {
  key: string;
  value: string;
}

/**
 * Die drei Per-Athleten-KV-Einträge. Bewusst explizit pro Feld, damit kein
 * Garmin-Passwort und keine Quervermischung in einen falschen Key gelangt — das war
 * der sicherheitskritische Kern, der früher testbar in `src/cli/seeding.ts` lag.
 */
function buildSeedEntries(input: {
  userId: string;
  finalSurge: { email: string; password: string };
  garmin: GarminSeed;
}): KvEntry[] {
  const { userId, finalSurge, garmin } = input;
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
  ];
}

/** Fortschritt/Hinweise auf stderr. */
function log(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

function die(msg: string): never {
  log(`Fehler: ${msg}`);
  process.exit(1);
}

/** Minimales `--flag value`-Parsing; nur was dieses CLI braucht. */
function parseArgs(argv: string[]): { user: string } {
  let user: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user") user = argv[++i];
  }
  if (!user) die("--user <name> ist erforderlich");
  return { user };
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

/** Ruft `npx wrangler` auf die KV der konfigurierten Umgebung (Binding aus web/wrangler.jsonc). */
function wrangler(args: string[], stdio: "pipe" | "inherit" = "pipe"): string {
  return execFileSync(
    "npx",
    ["wrangler", "kv", ...args, "--binding", "SESSION_KV", "--remote", "--config", WRANGLER_CONFIG],
    { encoding: "utf8", stdio: stdio === "inherit" ? "inherit" : ["ignore", "pipe", "inherit"] },
  );
}

async function main(): Promise<void> {
  const { user: userId } = parseArgs(process.argv.slice(2));
  log(`== Onboarding für Athlet "${userId}" ==`);
  // Zuerst und unübersehbar: in welche Umgebung dieser Lauf schreibt.
  log(`== Ziel-KV aus ${WRANGLER_CONFIG} ==`);

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
    garthJson = execFileSync("uv", ["run", "archive/seed_garmin_login.py"], {
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

  // --- KV schreiben: eine Bulk-Invocation, Secrets in temporärer Datei (nicht in argv) ---
  const entries = buildSeedEntries({
    userId,
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

  log(">> Fertig.");
}

main().catch((err) => die((err as Error).message));
