/**
 * Spike zu Issue #38 — MFA-Pfad, lokal. Wegwerf-Code.
 *
 * Bewusst in zwei Aufrufe geschnitten, weil der Worker es genauso tun muss:
 * zwischen Passwort und Code liegt eine Mail, also ein zweiter HTTP-Request
 * ohne offenen Prozess. Was dazwischen ueberlebt, ist eine JSON-Datei — im
 * Worker ein KV-Eintrag mit ~10 Minuten TTL. Wenn der Login *hier* ueber die
 * Datei hinweg funktioniert, funktioniert er dort ueber das KV hinweg.
 *
 *   npx tsx spike/phase2_mfa.ts begin           # -> Mail mit Code kommt
 *   npx tsx spike/phase2_mfa.ts resume 123456
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  beginLogin,
  exchangeTicket,
  fetchDisplayName,
  submitMfaCode,
  GarminLoginError,
  type MfaState,
  type Trace,
} from "./garminLogin.js";

const STATE_FILE =
  process.env.MFA_STATE_FILE ?? "/tmp/claude-1000/garmin-mfa-state.json";

function printTraces(traces: Trace[]): void {
  for (const t of traces) {
    const bits = [`HTTP ${t.status}`, `${t.bytes}B`];
    if (t.title) bits.push(`<title>=${JSON.stringify(t.title)}`);
    if (t.cfRay) bits.push(`cf-ray=${t.cfRay}`);
    console.error(`   ${t.step.padEnd(42)} ${bits.join("  ")}`);
  }
}

const [mode, code] = process.argv.slice(2);
const email = process.env.GARMIN_EMAIL;
const password = process.env.GARMIN_PASSWORD;
if (!email || !password) {
  console.error("GARMIN_EMAIL / GARMIN_PASSWORD nicht gesetzt");
  process.exit(1);
}

const traces: Trace[] = [];

try {
  if (mode === "begin") {
    console.error(`Konto: ECHT (mit MFA) — ${email}`);
    const result = await beginLogin(email, password, { delayMs: 0, traces });
    printTraces(traces);

    if (result.status === "success") {
      console.error("\nUnerwartet: kein MFA verlangt (Browser als vertrauenswuerdig gemerkt?).");
      const tokens = await exchangeTicket(result.ticket, { traces });
      const displayName = await fetchDisplayName(tokens, { traces });
      printTraces(traces.slice(-2));
      console.error(`   displayName: ${displayName}`);
      process.exit(0);
    }

    const serialized = JSON.stringify(result.state);
    writeFileSync(STATE_FILE, serialized);
    console.error(`\nMFA verlangt — der Login-Schritt hat getragen.`);
    console.error(`   Cookies im Zustand: ${Object.keys(result.state.cookies).join(", ")}`);
    console.error(`   Zustandsgroesse:    ${serialized.length} Bytes  (KV-tauglich)`);
    console.error(`   abgelegt in:        ${STATE_FILE}`);
    console.error(`\nJetzt den Code aus der Mail holen und:`);
    console.error(`   npx tsx spike/phase2_mfa.ts resume <code>`);
  } else if (mode === "resume") {
    if (!code) throw new Error("Kein MFA-Code uebergeben");
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as MfaState;
    console.error(`Zustand geladen (${Object.keys(state.cookies).length} Cookies)`);

    const { ticket } = await submitMfaCode(state, code, { traces });
    const tokens = await exchangeTicket(ticket, { traces });
    const displayName = await fetchDisplayName(tokens, { traces });
    printTraces(traces);

    console.error(`\nErfolg.`);
    console.error(`   displayName:  ${displayName}`);
    console.error(`   di_client_id: ${tokens.di_client_id}`);
    console.error(`   di_token:     ${tokens.di_token.slice(0, 24)}… (${tokens.di_token.length} Zeichen)`);
    console.error(`   refresh_token vorhanden: ${Boolean(tokens.di_refresh_token)}`);
  } else {
    console.error("Modus fehlt: begin | resume <code>");
    process.exit(1);
  }
} catch (err) {
  printTraces(traces);
  if (err instanceof GarminLoginError) {
    console.error(`\nFehlgeschlagen in Schritt ${err.step}: ${err.message}`);
  } else {
    console.error(`\nFehlgeschlagen: ${(err as Error).message}`);
  }
  process.exit(1);
}
