import type { VerbindungsZustand } from '@shared/verbindungen'

/**
 * Die **Einrichtung** (Issue #52): die vier Schritte, die ein neues Konto vom Login
 * bis zum ersten Steuerungsplan führen — als reine Funktion über das, was das System
 * ohnehin schon weiß.
 *
 * Zwei Dinge stehen hier und nirgends sonst:
 *
 * - **Die Reihenfolge.** Sie ist eine Empfehlung, kein Tor: Jeder Schritt ist für sich
 *   erledigbar und jederzeit nachholbar. Garmin steht trotzdem zuerst, weil seine
 *   *Erstbefüllung* im Hintergrund weiterläuft, während der Athlet die übrigen
 *   Schritte macht.
 * - **Was Pflicht ist.** Die beiden Verbindungen sind überspringbar — wer keinen
 *   Coach-Plan hat, braucht Final Surge nie, und ohne dieses „habe ich nicht" bliebe
 *   die Liste für jeden selbstgesteuerten Läufer dauerhaft unfertig. Genau dieses
 *   Signal („hier fehlt noch was") wird für den Connector gebraucht, und dann muss es
 *   etwas bedeuten.
 *
 * **Kein Zustand wird gemeldet.** Jeder Haken ist abgeleitet: die Verbindungen aus den
 * KV-Einträgen (Issue #44), der Connector aus den Grants des Athleten, das Onboarding
 * aus dem Vorhandensein des Steuerungsplans. Ein „erledigt"-Flag daneben wäre ein
 * zweiter Wahrheitsort mit demselben Zweck — und falsch in dem Moment, in dem jemand
 * seinen Plan löscht.
 *
 * Die Texte stehen bewusst **nicht** hier, sondern in der Fläche: Was hier zu
 * entscheiden ist, sind Reihenfolge und Haken, und nur das ist ohne Browser prüfbar.
 */

export type EinrichtungSchrittId = 'garmin' | 'finalsurge' | 'connector' | 'onboarding'

export interface EinrichtungSchritt {
  id: EinrichtungSchrittId
  erledigt: boolean
  /** Überspringbar — offen, aber kein Grund, die Liste unfertig zu nennen. */
  optional: boolean
}

export interface EinrichtungsEingaben {
  garmin: VerbindungsZustand
  finalsurge: VerbindungsZustand
  /** Hat dieser Athlet einen Grant, also einen eingerichteten Connector? */
  connector: boolean
  /** Existiert ein Steuerungsplan — das sichtbare Ergebnis des Onboardings? */
  steuerungsplan: boolean
}

/**
 * Eine kaputte Verbindung ist kein Haken: Von dort kommen keine Daten, und der
 * Schritt, der sie repariert, ist derselbe, der sie eingerichtet hätte.
 */
function verbunden(zustand: VerbindungsZustand): boolean {
  return zustand === 'verbunden'
}

export function einrichtungsSchritte({
  garmin,
  finalsurge,
  connector,
  steuerungsplan,
}: EinrichtungsEingaben): EinrichtungSchritt[] {
  return [
    { id: 'garmin', erledigt: verbunden(garmin), optional: true },
    { id: 'finalsurge', erledigt: verbunden(finalsurge), optional: true },
    { id: 'connector', erledigt: connector, optional: false },
    { id: 'onboarding', erledigt: steuerungsplan, optional: false },
  ]
}

/**
 * Ist noch ein **Pflicht**-Schritt offen? Daran hängt, ob die Einrichtung auf der
 * Startseite steht.
 *
 * Nur die Pflichtschritte zählen, und das ist der ganze Punkt des Überspringens: Ein
 * Athlet ohne Coach und ohne Garmin-Uhr hat alles getan, was er tun kann — ihn dafür
 * dauerhaft vor einer offenen Liste sitzen zu lassen, entwertet das Signal für alle.
 */
export function pflichtOffen(schritte: EinrichtungSchritt[]): boolean {
  return schritte.some(s => !s.optional && !s.erledigt)
}

/**
 * Wie viele Pflichtschritte noch offen sind — die Zahl, die die Einrichtung über dem
 * Dashboard ausspricht (Issue #57).
 *
 * Seit sie neben dem Dashboard steht statt an seiner Stelle, muss sie selbst sagen,
 * wie weit sie noch ist: Vorher war ihre bloße Anwesenheit die Ansage, jetzt ist sie
 * eine Karte unter anderen.
 */
export function offenePflichtSchritte(schritte: EinrichtungSchritt[]): number {
  return schritte.filter(s => !s.optional && !s.erledigt).length
}

/**
 * Der Schritt, an dem der Athlet gerade dran ist — aufgeklappt, während alle anderen
 * zugeklappt bleiben (Issue #57).
 *
 * Nur **Pflicht**-Schritte kommen dafür in Frage, und das ist der Unterschied zur
 * Reihenfolge der Liste: Eine bewusst übersprungene Verbindung steht vorn und bleibt
 * für immer offen — sie hier zu nennen, hieße dauerhaft den Schritt aufzuklappen, den
 * der Athlet gerade nicht machen will, statt den, der ihn noch aufhält.
 */
export function naechsterOffenerSchritt(
  schritte: EinrichtungSchritt[],
): EinrichtungSchrittId | null {
  return schritte.find(s => !s.optional && !s.erledigt)?.id ?? null
}
