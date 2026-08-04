/**
 * Spike zu Issue #38 — die eigentliche Messung. Wegwerf-Code.
 *
 * Das Kriterium des Issues ist eine **Quote, kein einzelner Erfolg**: 10
 * Login-Versuche ueber einen Tag verteilt aus dem deployten Worker, dieselben
 * 10 vom Laptop. Nur die Differenz isoliert IP und TLS-Fingerprint als Ursache
 * — beide Seiten fahren denselben Code aus `garminLogin.ts`.
 *
 * Jeder Versuch wird sofort als JSONL-Zeile angehaengt, statt am Ende gesammelt.
 * Ueber einen Tag verteilt heisst: der Prozess wird zwischendurch abgebrochen,
 * die Maschine schlaeft, das WLAN wechselt. Was schon gemessen wurde, darf das
 * nicht verlieren.
 *
 *   npx tsx spike/phase3_measure.ts --target both --n 1
 *   npx tsx spike/phase3_measure.ts --target both --n 5 --spacing 45
 *   npx tsx spike/phase3_measure.ts --summary
 *
 * Env: SPIKE_URL, SPIKE_TOKEN, GARMIN_TEST_EMAIL, GARMIN_TEST_PASSWORD
 */

import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { beginLogin, exchangeTicket, fetchDisplayName, GarminLoginError } from "./garminLogin.js";

const LOG = new URL("./measurements.jsonl", import.meta.url).pathname;

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

interface Measurement {
  ts: string;
  target: "worker" | "laptop";
  outcome: string;
  step?: string;
  httpStatus?: number;
  message?: string;
  ms: number;
}

function record(m: Measurement): void {
  appendFileSync(LOG, JSON.stringify(m) + "\n");
  const bad = m.outcome !== "success";
  const tail = bad ? `  ${m.step ?? ""} ${m.message ?? ""}`.trimEnd() : "";
  console.error(
    `${m.ts}  ${m.target.padEnd(6)}  ${m.outcome.padEnd(8)}  ${(m.ms / 1000).toFixed(1)}s${tail}`,
  );
}

function summary(): void {
  if (!existsSync(LOG)) return console.error("Noch nichts gemessen.");
  const rows = readFileSync(LOG, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Measurement);

  for (const target of ["worker", "laptop"] as const) {
    const mine = rows.filter((r) => r.target === target);
    if (!mine.length) continue;
    const ok = mine.filter((r) => r.outcome === "success").length;
    console.error(`\n${target}: ${ok}/${mine.length}`);
    const reasons = new Map<string, number>();
    for (const r of mine.filter((r) => r.outcome !== "success")) {
      const key = `${r.outcome} @ ${r.step ?? "?"}${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}`;
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    for (const [reason, n] of reasons) console.error(`   ${n}x  ${reason}`);
  }
}

async function attemptWorker(email: string, password: string): Promise<Measurement> {
  const started = Date.now();
  const base = { ts: new Date().toISOString(), target: "worker" as const };
  try {
    const res = await fetch(`${process.env.SPIKE_URL}/probe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SPIKE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    return {
      ...base,
      outcome: (data.outcome as string) ?? `http-${res.status}`,
      step: data.step as string | undefined,
      httpStatus: data.httpStatus as number | undefined,
      message: data.message as string | undefined,
      ms: Date.now() - started,
    };
  } catch (err) {
    return { ...base, outcome: "driver-error", message: (err as Error).message, ms: Date.now() - started };
  }
}

async function attemptLaptop(email: string, password: string): Promise<Measurement> {
  const started = Date.now();
  const base = { ts: new Date().toISOString(), target: "laptop" as const };
  try {
    const begin = await beginLogin(email, password, { delayMs: 0 });
    if (begin.status === "mfa_required") {
      return { ...base, outcome: "mfa_required", ms: Date.now() - started };
    }
    const tokens = await exchangeTicket(begin.ticket);
    await fetchDisplayName(tokens);
    return { ...base, outcome: "success", ms: Date.now() - started };
  } catch (err) {
    if (err instanceof GarminLoginError) {
      return {
        ...base,
        outcome: "failed",
        step: err.step,
        httpStatus: err.httpStatus,
        message: err.message,
        ms: Date.now() - started,
      };
    }
    return { ...base, outcome: "error", message: (err as Error).message, ms: Date.now() - started };
  }
}

if (args.includes("--summary")) {
  summary();
} else {
  const email = process.env.GARMIN_TEST_EMAIL!;
  const password = process.env.GARMIN_TEST_PASSWORD!;
  const target = flag("target", "both")!;
  const n = Number(flag("n", "1"));
  const spacingMin = Number(flag("spacing", "0"));

  if (target !== "laptop" && (!process.env.SPIKE_URL || !process.env.SPIKE_TOKEN)) {
    console.error("SPIKE_URL / SPIKE_TOKEN nicht gesetzt");
    process.exit(1);
  }

  for (let i = 0; i < n; i++) {
    if (i > 0 && spacingMin > 0) {
      console.error(`… ${spacingMin} min Pause`);
      await new Promise((r) => setTimeout(r, spacingMin * 60_000));
    }
    if (target === "worker" || target === "both") record(await attemptWorker(email, password));
    // Kurz versetzt, damit die beiden Seiten nicht als ein Doppel-Login auffallen.
    if (target === "both") await new Promise((r) => setTimeout(r, 20_000));
    if (target === "laptop" || target === "both") record(await attemptLaptop(email, password));
  }
  summary();
}
