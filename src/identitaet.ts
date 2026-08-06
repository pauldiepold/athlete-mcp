/**
 * Konto-Identität (geteilte Server-Shell): bildet die Anmeldung eines Athleten auf
 * sein Konto ab und lässt Konten überhaupt erst entstehen. Tritt an die Stelle, die
 * das Pfad-Secret freimacht (ADR-0007) — vorher *war* ein Link die Anmeldung, jetzt
 * ist es eine Identität bei einem Anmeldeverfahren.
 *
 * Die Begriffe, scharf getrennt:
 * - **Konto** — die `userId` samt Fachdaten in D1 und Einträgen im KV.
 * - **Identität** — `<provider>:<sub>`, der Anker der Anmeldung.
 * - **Anmeldeverfahren** — Google oder Apple, also die Sorte einer Identität.
 *
 * **Ein Konto hat immer genau eine aktive Identität.** Das ist ein Invariant, keine
 * Beschreibung des Normalfalls: Ein Mapping, das nie verschwindet, wäre ein Schlüssel,
 * der nie eingezogen wird — der realistische Fall ist ein Athlet, der sein Google-Konto
 * verliert und einen neuen Code bekommt, während das alte weiter die Tür öffnet.
 *
 * Sicherheitskritisch in derselben Weise wie das Seeding (siehe cli/seeding.ts): ein
 * falsches Mapping liefert stillschweigend fremde Körperdaten und fremde Steuerung aus.
 * Deshalb reine Funktionen mit KV als Argument und danebenliegenden Tests.
 *
 * Bewusst nur Web-APIs (crypto/btoa), damit das Modul ohne @types/node neben dem
 * Worker-Code typecheckt. `src/` bleibt Domänen-Bibliothek ohne Framework-Bezug.
 */

import { listKvKeys } from "./kvKeys.js";
import { zufallsToken } from "./zufall.js";

/** Die unterstützten Anmeldeverfahren. Der Provider ist ein Argument, kein Zweig. */
export type Provider = "google" | "apple";

export const PROVIDER: readonly Provider[] = ["google", "apple"];

/**
 * Ein Konto-Profil: reines **Anzeige-Material**. Die Identitäts-Auflösung liest
 * ausschließlich `<provider>:<sub>` und befragt das Profil nie — insbesondere ist die
 * E-Mail-Adresse ein Attribut und niemals ein Identifier (sonst verschmölzen Google-
 * und Apple-Konto derselben Person stillschweigend).
 */
export interface Profil {
  /** Vom Athleten gesetzt, aus dem Provider vorbelegt; leer ist erlaubt. */
  anzeigename: string;
  /** Vom Provider mitgeliefert, bei jedem Login aufgefrischt; leer ist erlaubt. */
  email: string;
  provider: Provider;
  sub: string;
}

/** Ein Invite-Code, wie er im KV liegt. Ohne `userId` ist er ein *freier* Code. */
export interface Invite {
  /**
   * Das Konto, an das dieser Code gebunden ist. Fehlt es, legt das Einlösen ein
   * **neues** Konto an (das Einladungstor); steht es da, ersetzt das Einlösen die
   * Identität eines **bestehenden** Kontos (der Verfahrenswechsel).
   */
  userId?: string;
}

/** Ein offener Code, wie ihn die Admin-Fläche listet. */
export interface OffenerInvite extends Invite {
  code: string;
}

/** Ein Konto mit seinem Profil, wie es die Admin-Fläche listet. */
export interface Konto {
  userId: string;
  profil: Profil | null;
}

/**
 * Offene Codes verfallen nach 14 Tagen. Ein Code ist ein Schlüssel zu einem Konto;
 * einer, der ewig gilt, ist einer, den niemand mehr im Blick hat.
 */
export const INVITE_TTL_SEKUNDEN = 14 * 24 * 60 * 60;

const INVITE_PREFIX = "invite:";

/** KV-Key der Identität. Das Verfahren ist Teil des Keys, nicht des Werts. */
export function identitaetKey(provider: Provider, sub: string): string {
  return `${provider}:${sub}`;
}

/** KV-Key des Profils. */
export function profilKey(userId: string): string {
  return `user:${userId}:profile`;
}

/**
 * Ein nicht erratbarer Invite-Code (24 Zufallsbytes → 32 base64url-Zeichen) —
 * dieselbe Mechanik wie die abgelösten URL-Secrets, denn er hat denselben Rang:
 * wer ihn hat, bekommt ein Konto.
 */
export function generateInviteCode(): string {
  return zufallsToken(24);
}

/**
 * Die `userId` eines neu entstehenden Kontos: opak und generiert.
 *
 * Sprechende IDs (`paul`, `jonas`) gibt es weiterhin — für die Bestandskonten und
 * dort, wo der Operator bewusst eines anlegt. Ein *freier* Code kennt aber kein Konto,
 * also könnte niemand vorher einen Namen vergeben; genau das ist der Punkt, denn das
 * Tor soll perspektivisch ohne Operator auskommen. Lesbarkeit liefert der Anzeigename.
 */
export function generateUserId(): string {
  return zufallsToken(12);
}

/**
 * Die `userId` zu einer Identität; null, wenn diese Identität kein Konto hat (dann
 * braucht der Athlet einen Invite-Code).
 *
 * Der **einzige** Auflösungsweg der Anmeldung. Das Verfahren steckt im Key: derselbe
 * `sub`-Wert unter `google:` und unter `apple:` sind zwei verschiedene Identitäten.
 */
export async function resolveIdentitaet(
  kv: KVNamespace,
  provider: Provider,
  sub: string,
): Promise<string | null> {
  if (!sub) {
    return null;
  }
  return (await kv.get(identitaetKey(provider, sub))) ?? null;
}

/** Das Profil eines Kontos; null, wenn keines geschrieben ist. */
export async function getProfil(
  kv: KVNamespace,
  userId: string,
): Promise<Profil | null> {
  const gelesen = await leseProfil(kv, userId);
  return gelesen.zustand === "vorhanden" ? gelesen.profil : null;
}

/**
 * Dasselbe Lesen, aber mit dem Unterschied, auf den es beim Schreiben ankommt:
 * `fehlt` (noch kein Profil) gegen `unlesbar` (da, aber kaputt).
 *
 * Nach außen sind beide „kein Profil" — ein kaputtes Profil ist Anzeige-Material, das
 * fehlt, und kein Grund, einen Login zu kippen. Wer aber gleich darüber schreiben
 * will, muss sie auseinanderhalten: Über `fehlt` darf geschrieben werden, über
 * `unlesbar` nicht. Sonst ersetzt ein einziger Login ein beschädigtes Profil durch
 * eines mit leerem Anzeigenamen — und bei Apple ist der Name danach endgültig weg,
 * weil der Provider ihn nur bei der allerersten Autorisierung liefert.
 */
async function leseProfil(
  kv: KVNamespace,
  userId: string,
): Promise<
  { zustand: "vorhanden"; profil: Profil } | { zustand: "fehlt" | "unlesbar" }
> {
  const roh = await kv.get(profilKey(userId));
  if (!roh) return { zustand: "fehlt" };
  try {
    return { zustand: "vorhanden", profil: JSON.parse(roh) as Profil };
  } catch {
    return { zustand: "unlesbar" };
  }
}

/** Schreibt das Profil eines Kontos (vollständig, nicht teilweise). */
export async function setProfil(
  kv: KVNamespace,
  userId: string,
  profil: Profil,
): Promise<void> {
  await kv.put(profilKey(userId), JSON.stringify(profil));
}

/**
 * Stellt einen Invite-Code aus. Ohne `userId` ist er *frei* (legt beim Einlösen ein
 * neues Konto an), mit `userId` *kontogebunden* (ersetzt die Identität dieses Kontos).
 */
export async function createInvite(
  kv: KVNamespace,
  userId?: string,
): Promise<OffenerInvite> {
  const code = generateInviteCode();
  const invite: Invite = userId ? { userId } : {};
  await kv.put(`${INVITE_PREFIX}${code}`, JSON.stringify(invite), {
    expirationTtl: INVITE_TTL_SEKUNDEN,
  });
  return { code, ...invite };
}

/** Die offenen Codes im Klartext — der Operator muss sie weitergeben können. */
export async function listInvites(kv: KVNamespace): Promise<OffenerInvite[]> {
  const offen: OffenerInvite[] = [];
  for (const key of await listKvKeys(kv, INVITE_PREFIX)) {
    const roh = await kv.get(key);
    if (!roh) continue;
    let invite: Invite;
    try {
      invite = JSON.parse(roh) as Invite;
    } catch {
      continue;
    }
    offen.push({ code: key.slice(INVITE_PREFIX.length), ...invite });
  }
  offen.sort((a, b) => a.code.localeCompare(b.code));
  return offen;
}

/**
 * Alle Konten, die eine Identität haben, samt Profil — die Operator-Sicht auf
 * „wer ist eingelöst". Konten ohne Identität (frisch angelegt, nie angemeldet)
 * existieren in diesem System nicht: ein Konto entsteht erst beim Einlösen.
 */
export async function listKonten(kv: KVNamespace): Promise<Konto[]> {
  const userIds = new Set<string>();
  for (const provider of PROVIDER) {
    for (const key of await listKvKeys(kv, `${provider}:`)) {
      const userId = await kv.get(key);
      if (userId) userIds.add(userId);
    }
  }

  const konten: Konto[] = [];
  for (const userId of userIds) {
    konten.push({ userId, profil: await getProfil(kv, userId) });
  }
  konten.sort((a, b) => a.userId.localeCompare(b.userId));
  return konten;
}

export interface EinloesenEingabe {
  code: string;
  provider: Provider;
  sub: string;
  /** Vorbelegung aus dem Provider bzw. vom Athleten bestätigt; leer ist erlaubt. */
  anzeigename?: string;
  /** Vom Provider mitgeliefert; leer ist erlaubt. */
  email?: string;
}

/**
 * Gescheitert gibt es nur in einer Ausführung: Unbekannter, verbrauchter und
 * abgelaufener Code sind für den Aufrufer derselbe Fall — ein verbrauchter Code ist
 * gelöscht, ein abgelaufener von KV entfernt, beide also schlicht nicht mehr da. Wer
 * die drei unterscheiden könnte, könnte Codes durchprobieren und aus der Antwort
 * etwas lernen.
 */
export type EinloesenErgebnis =
  | { ok: true; userId: string; profil: Profil }
  | { ok: false; fehler: "unbekannt" };

/**
 * Alle Identitäten, die auf `userId` zeigen — über beide Verfahren hinweg. Bewusst
 * ein Scan statt eines Rückwärts-Keys im Profil: das Profil ist Anzeige-Material und
 * darf keine zweite Wahrheit über die Identität führen. Bei einer Handvoll Konten
 * (ADR-0001) ist das ein kurzer Scan.
 */
async function findIdentitaeten(
  kv: KVNamespace,
  userId: string,
): Promise<string[]> {
  const keys: string[] = [];
  for (const provider of PROVIDER) {
    for (const key of await listKvKeys(kv, `${provider}:`)) {
      if ((await kv.get(key)) === userId) keys.push(key);
    }
  }
  return keys;
}

/**
 * Löst einen Invite-Code ein: die Identität bekommt ein Konto.
 *
 * Ein *freier* Code legt ein neues Konto mit generierter, opaker `userId` an. Ein
 * *kontogebundener* Code hängt die Identität an das genannte Konto und **ersetzt**
 * dessen bisherige — der Verfahrenswechsel, mit dem die Bestandsathleten migriert
 * werden und mit dem ein weggebrochenes Anmeldeverfahren repariert wird. Die Fachdaten
 * bleiben dabei unberührt: an `userId` ändert sich nichts.
 *
 * Reihenfolge: **erst neu schreiben, dann alt löschen.** KV kennt keine Transaktion,
 * und ein Abbruch dazwischen soll zwei Identitäten hinterlassen (harmlos, heilt beim
 * nächsten Einlösen) statt keine (Athlet ausgesperrt).
 *
 * Unbekannter, verbrauchter und abgelaufener Code sind für den Aufrufer **derselbe**
 * Fall — ein verbrauchter Code ist gelöscht, ein abgelaufener von KV entfernt, beide
 * also schlicht nicht mehr da.
 */
export async function einloesenInvite(
  kv: KVNamespace,
  eingabe: EinloesenEingabe,
): Promise<EinloesenErgebnis> {
  const { code, provider, sub } = eingabe;
  if (!code || !sub) {
    return { ok: false, fehler: "unbekannt" };
  }

  const roh = await kv.get(`${INVITE_PREFIX}${code}`);
  if (!roh) {
    return { ok: false, fehler: "unbekannt" };
  }

  let invite: Invite;
  try {
    invite = JSON.parse(roh) as Invite;
  } catch {
    return { ok: false, fehler: "unbekannt" };
  }

  const userId = invite.userId || generateUserId();
  const neuerKey = identitaetKey(provider, sub);

  // Die bisherigen Identitäten des Kontos werden **vor** dem Schreiben ermittelt,
  // damit die gerade geschriebene nicht gleich wieder mitgelöscht wird.
  const alteKeys = (await findIdentitaeten(kv, userId)).filter(
    (key) => key !== neuerKey,
  );

  await kv.put(neuerKey, userId);

  const profil: Profil = {
    anzeigename: eingabe.anzeigename?.trim() ?? "",
    email: eingabe.email?.trim() ?? "",
    provider,
    sub,
  };
  await setProfil(kv, userId, profil);

  for (const key of alteKeys) {
    await kv.delete(key);
  }

  // Der eingelöste Code ist verbraucht; die übrigen offenen Codes desselben Kontos
  // ebenfalls — sonst bliebe nach einem Verfahrenswechsel ein zweiter Schlüssel liegen.
  await kv.delete(`${INVITE_PREFIX}${code}`);
  for (const offen of await listInvites(kv)) {
    if (offen.userId === userId) {
      await kv.delete(`${INVITE_PREFIX}${offen.code}`);
    }
  }

  return { ok: true, userId, profil };
}

/**
 * Frischt E-Mail-Adresse (und, wenn der Provider einen liefert, nichts sonst) eines
 * bestehenden Kontos beim Login auf. Der **Anzeigename bleibt unangetastet**: der
 * Provider liefert ihn nur als Vorbelegung beim Einlösen — Apple schickt ihn genau
 * einmal, und ein vom Athleten korrigierter Name darf nicht bei jedem Login
 * zurückfallen.
 */
export async function aktualisiereProfilBeimLogin(
  kv: KVNamespace,
  userId: string,
  provider: Provider,
  sub: string,
  email: string | undefined,
): Promise<Profil> {
  const gelesen = await leseProfil(kv, userId);
  const vorher = gelesen.zustand === "vorhanden" ? gelesen.profil : null;

  const profil: Profil = {
    anzeigename: vorher?.anzeigename ?? "",
    email: email?.trim() || vorher?.email || "",
    provider,
    sub,
  };

  // Über ein unlesbares Profil wird nicht geschrieben: Der Anzeigename steckt dort
  // vielleicht noch drin und ließe sich von Hand retten — überschrieben ist er weg.
  // Der Login selbst läuft trotzdem durch, er hängt an der Identität, nicht am Profil.
  if (gelesen.zustand !== "unlesbar") {
    await setProfil(kv, userId, profil);
  }

  return profil;
}
