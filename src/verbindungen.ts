/**
 * Die **Verbindungen** eines Athleten zu seinen **Datenquellen** — Final Surge und
 * Garmin (Issue #44).
 *
 * Begriffe, seit diesem Issue scharf: *Connector* ist ausschließlich das, was Claude
 * hat (der MCP-Zugang aus Issue #43). Was der Athlet in den Einstellungen einrichtet,
 * ist eine **Verbindung** zu einer **Datenquelle**. Beides „Connector" zu nennen, wie
 * es die Vorarbeit tat, verwirrt spätestens in der Oberfläche.
 *
 * Der Zustand einer Verbindung hat **zwei** Quellen, und das ist der Kern dieses
 * Moduls:
 *
 * - *Verbunden* wird **abgeleitet** — aus dem Vorhandensein der Per-Athleten-Einträge
 *   im KV. Eine reine Funktion über einen gegebenen Satz Schlüssel, mehr nicht.
 * - *Kaputt* wird **beobachtet** — ein gescheiterter echter Aufruf setzt einen
 *   Fehler-Marker, ein erfolgreicher löscht ihn.
 *
 * Ohne den zweiten Zustand zeigte die Oberfläche „verbunden", während Claude scheitert:
 * Ob ein Passwort noch stimmt und ob ein Refresh-Token noch trägt, weiß man erst beim
 * Benutzen. Ein Eintrag im KV beweist nur, dass jemand einmal etwas eingerichtet hat.
 *
 * Bewusst nur Web-APIs, damit das Modul ohne @types/node neben dem Worker-Code
 * typecheckt. `src/` bleibt Domänen-Bibliothek ohne Framework-Bezug.
 */

import { listKvKeys } from "./kvKeys.js";

/** Die Datenquellen, zu denen ein Athlet eine Verbindung herstellt. */
export type Datenquelle = "finalsurge" | "garmin";

export const DATENQUELLEN: readonly Datenquelle[] = ["finalsurge", "garmin"];

/** Wie die Datenquellen in der Oberfläche und in Tool-Antworten heißen. */
export const DATENQUELLE_NAMEN: Record<Datenquelle, string> = {
  finalsurge: "Final Surge",
  garmin: "Garmin",
};

/**
 * `fehlt` — nie eingerichtet. `verbunden` — eingerichtet und zuletzt tragfähig.
 * `kaputt` — eingerichtet, aber der letzte echte Aufruf ist gescheitert.
 */
export type VerbindungsZustand = "fehlt" | "verbunden" | "kaputt";

/**
 * Der Fehler-Marker einer kaputten Verbindung. `meldung` ist **für den Athleten**
 * geschrieben und wird so angezeigt — interne Details (KV-Schlüssel, HTTP-Rohtexte)
 * gehören nicht hinein.
 */
export interface FehlerMarker {
  meldung: string;
  /** ISO-Zeitstempel des gescheiterten Aufrufs. */
  seit: string;
}

/** Eine Verbindung, wie die Oberfläche sie zeigt. */
export interface Verbindung {
  quelle: Datenquelle;
  name: string;
  zustand: VerbindungsZustand;
  /** Nur bei `kaputt` gesetzt. */
  meldung: string | null;
  seit: string | null;
}

/**
 * Was im Fehler-Marker steht — die eine Stelle, an der diese Sätze stehen.
 *
 * Sie werden von drei Beobachtern geschrieben (MCP-Tools, nächtlicher Cron, das
 * Einrichten selbst) und an einer Stelle gelesen: in den Einstellungen des Athleten.
 * Getrennte Fassungen je Beobachter würden auseinanderdriften, obwohl sie in denselben
 * KV-Eintrag schreiben — und der Athlet bekäme je nachdem, wer zuletzt gescheitert
 * ist, eine andere Auskunft über dieselbe Verbindung.
 *
 * Bewusst ohne technische Ursache: „Refresh-Token abgelaufen" beantwortet nicht die
 * Frage, was er jetzt tun soll. Die rohe Meldung gehört ins Log, nicht hierher.
 */
export const FEHLER_MELDUNG: Record<Datenquelle, string> = {
  finalsurge:
    "Der letzte Abruf bei Final Surge ist gescheitert. Vermutlich stimmen die " +
    "Zugangsdaten nicht mehr — bitte verbinde Final Surge neu.",
  garmin:
    "Der letzte Abruf bei Garmin ist gescheitert. Vermutlich ist die Anmeldung " +
    "abgelaufen — bitte verbinde Garmin neu.",
};

/** Der KV-Eintrag, dessen Vorhandensein „verbunden" bedeutet. */
export function verbindungsKey(userId: string, quelle: Datenquelle): string {
  return `user:${userId}:${quelle}`;
}

/** Der KV-Eintrag des Fehler-Markers. */
export function fehlerKey(userId: string, quelle: Datenquelle): string {
  return `user:${userId}:${quelle}:fehler`;
}

/**
 * Der Zustand aller Verbindungen — **rein**, über einen gegebenen Satz vorhandener
 * KV-Schlüssel und die gelesenen Marker.
 *
 * Der Vergleich ist exakt und nicht per Präfix: Neben `user:<id>:finalsurge` liegen
 * `user:<id>:finalsurge:session` und `user:<id>:garmin:profile`, und ein
 * Präfix-Vergleich hielte einen abgelaufenen Session-Cache für eine Verbindung.
 *
 * Ein Marker ohne Eintrag wird ignoriert: Was nicht eingerichtet ist, ist `fehlt` und
 * nicht `kaputt` — der Athlet soll einrichten, nicht reparieren.
 */
export function verbindungsZustand(
  userId: string,
  vorhandeneKeys: Iterable<string>,
  marker: Partial<Record<Datenquelle, FehlerMarker | null>> = {},
): Verbindung[] {
  const keys = new Set(vorhandeneKeys);

  return DATENQUELLEN.map((quelle) => {
    const eingerichtet = keys.has(verbindungsKey(userId, quelle));
    const fehler = eingerichtet ? (marker[quelle] ?? null) : null;

    return {
      quelle,
      name: DATENQUELLE_NAMEN[quelle],
      zustand: !eingerichtet ? "fehlt" : fehler ? "kaputt" : "verbunden",
      meldung: fehler?.meldung ?? null,
      seit: fehler?.seit ?? null,
    };
  });
}

/** Ein einzelner Fehler-Marker aus dem KV; unlesbares gilt als keiner. */
async function leseMarker(
  kv: KVNamespace,
  userId: string,
  quelle: Datenquelle,
): Promise<FehlerMarker | null> {
  const roh = await kv.get(fehlerKey(userId, quelle));
  if (!roh) return null;
  try {
    return JSON.parse(roh) as FehlerMarker;
  } catch {
    return null;
  }
}

/** Der Zustand aller Verbindungen eines Athleten, aus dem KV gelesen. */
export async function leseVerbindungen(
  kv: KVNamespace,
  userId: string,
): Promise<Verbindung[]> {
  const keys = await listKvKeys(kv, `user:${userId}:`);
  const marker: Partial<Record<Datenquelle, FehlerMarker | null>> = {};
  for (const quelle of DATENQUELLEN) {
    marker[quelle] = await leseMarker(kv, userId, quelle);
  }
  return verbindungsZustand(userId, keys, marker);
}

/**
 * Ist diese Datenquelle eingerichtet? Ein einzelner `get` statt eines Listen-Scans —
 * die Frage steht vor **jedem** Tool-Aufruf, und ein Scan über alle Schlüssel des
 * Athleten wäre dafür zu teuer.
 *
 * Bewusst blind gegen den Fehler-Marker: Eine kaputte Verbindung wird trotzdem
 * benutzt. Ob sie noch trägt, weiß man erst beim Aufruf — und ein Marker von gestern
 * darf einen heute geglückten Refresh nicht verhindern.
 */
export async function istVerbunden(
  kv: KVNamespace,
  userId: string,
  quelle: Datenquelle,
): Promise<boolean> {
  return (await kv.get(verbindungsKey(userId, quelle))) !== null;
}

/** Setzt den Fehler-Marker einer Datenquelle. */
export async function meldeFehler(
  kv: KVNamespace,
  userId: string,
  quelle: Datenquelle,
  meldung: string,
): Promise<void> {
  const marker: FehlerMarker = { meldung, seit: new Date().toISOString() };
  await kv.put(fehlerKey(userId, quelle), JSON.stringify(marker));
}

/** Löscht den Fehler-Marker einer Datenquelle. */
export async function meldeErfolg(
  kv: KVNamespace,
  userId: string,
  quelle: Datenquelle,
): Promise<void> {
  await kv.delete(fehlerKey(userId, quelle));
}

/**
 * Führt einen echten Aufruf gegen eine Datenquelle aus und **beobachtet** dabei ihren
 * Zustand: geglückt löscht den Marker, gescheitert setzt ihn.
 *
 * Der Fehler fliegt danach weiter. Das Beobachten ist eine Nebenwirkung und keine
 * Fehlerbehandlung — wer aufgerufen hat, soll weiterhin merken, dass nichts kam.
 *
 * In den Marker geht `FEHLER_MELDUNG`, nie die rohe Fehlermeldung: Die enthält
 * KV-Schlüssel, URLs und HTTP-Rohtexte, und der Marker wird angezeigt.
 */
export async function beobachte<T>(
  kv: KVNamespace,
  userId: string,
  quelle: Datenquelle,
  aufruf: () => Promise<T>,
): Promise<T> {
  try {
    const ergebnis = await aufruf();
    await meldeErfolg(kv, userId, quelle);
    return ergebnis;
  } catch (err) {
    await meldeFehler(kv, userId, quelle, FEHLER_MELDUNG[quelle]);
    throw err;
  }
}

/** Die Zugangsdaten, mit denen sich der Worker bei Final Surge anmeldet. */
export interface FinalSurgeZugang {
  email: string;
  password: string;
}

/**
 * Legt die Final-Surge-Zugangsdaten ab (Issue #35: vorerst im Klartext — bewusst
 * aufgeschoben, nicht übersehen) und wirft den gecachten Session-Token weg.
 *
 * Das Wegwerfen ist der Punkt beim *Neu verbinden*: Der Session-Cache hält sechs
 * Stunden, und ohne dieses Löschen liefe der Athlet nach einer Passwortänderung
 * genauso lange weiter in dieselbe kaputte Session — er hätte alles richtig gemacht
 * und trotzdem keine Wirkung gesehen.
 */
export async function speichereFinalSurge(
  kv: KVNamespace,
  userId: string,
  zugang: FinalSurgeZugang,
): Promise<void> {
  await kv.put(
    verbindungsKey(userId, "finalsurge"),
    JSON.stringify({ email: zugang.email, password: zugang.password }),
  );
  await kv.delete(`${verbindungsKey(userId, "finalsurge")}:session`);
  await meldeErfolg(kv, userId, "finalsurge");
}

/** Das, was von einem geglückten Garmin-Login übrig bleibt und bleiben darf. */
export interface GarminAnmeldung {
  di_token: string;
  di_refresh_token: string;
  di_client_id: string;
  display_name: string;
}

/**
 * Legt das Garmin-DI-Bündel ab — und **nur** das.
 *
 * Die Auflage aus Spike #38: Garmin-Zugangsdaten werden nie gespeichert. Sie werden
 * einmal durchgereicht und sind danach weg; erneuert wird über den Refresh-Token.
 * Deshalb steht hier jedes Feld einzeln und nicht ein durchgereichtes Objekt: Ein
 * `{...eingabe}` hätte irgendwann ein Passwort mit in den KV getragen, ohne dass es
 * jemandem aufgefallen wäre.
 *
 * Der `display_name` liegt daneben, nicht mit im Bündel: Der Sleep-Endpunkt braucht
 * ihn im Pfad, der Token-Refresh schreibt das Bündel aber komplett neu — zusammen in
 * einem Eintrag ginge er bei jedem Refresh verloren.
 */
export async function speichereGarmin(
  kv: KVNamespace,
  userId: string,
  anmeldung: GarminAnmeldung,
): Promise<void> {
  await kv.put(
    verbindungsKey(userId, "garmin"),
    JSON.stringify({
      di_token: anmeldung.di_token,
      di_refresh_token: anmeldung.di_refresh_token,
      di_client_id: anmeldung.di_client_id,
    }),
  );
  await kv.put(
    `${verbindungsKey(userId, "garmin")}:profile`,
    JSON.stringify({ display_name: anmeldung.display_name }),
  );
  await meldeErfolg(kv, userId, "garmin");
}
