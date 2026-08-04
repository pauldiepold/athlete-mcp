/**
 * Spike zu Issue #38 — lokaler Treiber fuer die TS-Portierung. Wegwerf-Code.
 *
 *   npx tsx spike/phase1_local.ts                 # Test-Konto, ohne MFA
 *   npx tsx spike/phase1_local.ts --real          # eigenes Konto, MFA interaktiv
 *   npx tsx spike/phase1_local.ts --repeat 10     # Laptop-Seite der Messung
 *   npx tsx spike/phase1_local.ts --no-delay      # ohne Anti-WAF-Pause
 *
 * Dasselbe Modul laeuft spaeter unveraendert im Worker; hier ist nur der
 * Treiber drumherum ein anderer. Genau darin liegt der Wert der Messung: die
 * Laptop-Zahl und die Worker-Zahl unterscheiden sich dann in IP und
 * TLS-Fingerprint — und in sonst nichts.
 */

import { createInterface } from "node:readline/promises";
import {
  beginLogin,
  exchangeTicket,
  fetchDisplayName,
  submitMfaCode,
  GarminLoginError,
  type Trace,
} from "./garminLogin.js";

const args = process.argv.slice(2);
const real = args.includes("--real");
const noDelay = args.includes("--no-delay");
const repeatArg = args.indexOf("--repeat");
const repeat = repeatArg >= 0 ? Number(args[repeatArg + 1]) : 1;

const prefix = real ? "GARMIN" : "GARMIN_TEST";
const email = process.env[`${prefix}_EMAIL`];
const password = process.env[`${prefix}_PASSWORD`];
if (!email || !password) {
  console.error(`${prefix}_EMAIL / ${prefix}_PASSWORD nicht gesetzt`);
  process.exit(1);
}

const delayMs = noDelay ? 0 : undefined;

function printTraces(traces: Trace[]): void {
  for (const t of traces) {
    const bits = [`HTTP ${t.status}`, `${t.bytes}B`];
    if (t.title) bits.push(`<title>=${JSON.stringify(t.title)}`);
    if (t.cfRay) bits.push(`cf-ray=${t.cfRay}`);
    console.error(`   ${t.step.padEnd(42)} ${bits.join("  ")}`);
  }
}

async function askMfaCode(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const code = await rl.question("Garmin MFA-Code: ");
  rl.close();
  return code.trim();
}

async function oneAttempt(n: number): Promise<{ ok: boolean; detail: string; ms: number }> {
  const traces: Trace[] = [];
  const started = Date.now();
  try {
    const begin = await beginLogin(email!, password!, { delayMs, traces });

    let ticket: string;
    if (begin.status === "mfa_required") {
      console.error(`\n[${n}] MFA verlangt — Login-Schritt hat getragen.`);
      printTraces(traces);
      console.error(`   Cookies im Zwischenzustand: ${Object.keys(begin.state.cookies).join(", ")}`);
      console.error(`   Zustandsgroesse (JSON): ${JSON.stringify(begin.state).length} Bytes`);
      const code = await askMfaCode();
      ({ ticket } = await submitMfaCode(begin.state, code, { traces }));
    } else {
      ticket = begin.ticket;
    }

    const tokens = await exchangeTicket(ticket, { traces });
    const displayName = await fetchDisplayName(tokens, { traces });
    const ms = Date.now() - started;

    console.error(`\n[${n}] Erfolg (${(ms / 1000).toFixed(1)}s)`);
    printTraces(traces);
    console.error(`   displayName:  ${displayName}`);
    console.error(`   di_client_id: ${tokens.di_client_id}`);
    console.error(`   di_token:     ${tokens.di_token.slice(0, 24)}… (${tokens.di_token.length} Zeichen)`);
    return { ok: true, detail: "success", ms };
  } catch (err) {
    const ms = Date.now() - started;
    const detail =
      err instanceof GarminLoginError
        ? `${err.step}: ${err.message}`
        : `${(err as Error).name}: ${(err as Error).message}`;
    console.error(`\n[${n}] Fehlgeschlagen (${(ms / 1000).toFixed(1)}s) — ${detail}`);
    printTraces(traces);
    return { ok: false, detail, ms };
  }
}

console.error(`Konto: ${real ? "ECHT (mit MFA)" : "TEST (ohne MFA)"} — ${email}`);
console.error(`Versuche: ${repeat}${noDelay ? "  (ohne Anti-WAF-Pause)" : ""}`);

const results: Array<{ ok: boolean; detail: string; ms: number }> = [];
for (let n = 1; n <= repeat; n++) {
  if (n > 1) {
    // Nicht wie ein Burst aussehen; die echte Messung verteilt ohnehin ueber den Tag.
    console.error("\n… 30 s Pause");
    await new Promise((r) => setTimeout(r, 30_000));
  }
  results.push(await oneAttempt(n));
}

const ok = results.filter((r) => r.ok).length;
console.error(`\n== Quote: ${ok}/${results.length}`);
console.log(
  JSON.stringify(
    { quote: `${ok}/${results.length}`, konto: prefix, versuche: results },
    null,
    2,
  ),
);
