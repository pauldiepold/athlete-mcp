/**
 * Was ein OAuth-Grant über den Athleten trägt — und was daraus wieder herausgelesen
 * werden darf (ADR-0007, Issue #43).
 *
 * **Ausschließlich die `userId`.** Das ist keine Sparsamkeit, sondern eine Aussage
 * über Haltbarkeit: Die Props werden beim Zustimmen verschlüsselt ins Token gelegt und
 * leben dort, bis der Grant gelöscht wird — also potenziell jahrelang. Alles, was sich
 * ändern kann (Anzeigename, verbundene Datenquellen, Operator-Rolle), wäre darin
 * eingefroren und würde bei jedem Tool-Aufruf einen veralteten Stand behaupten. Die
 * `userId` ändert sich nie; alles andere wird pro Request frisch aus KV und D1 gelesen.
 *
 * Die Prüfung hier ist die Türschwelle des MCP-Endpunkts: Sie beantwortet „wer fragt
 * hier eigentlich" — dieselbe Frage, die vorher das Pfad-Secret beantwortet hat, und
 * eine falsche Antwort liefert fremde Körperdaten und fremde Steuerung aus. Deshalb
 * eine pure Funktion mit Tests daneben statt einer Zeile im Route-Handler.
 */

/** Die Props eines Grants. Genau ein Feld, und das mit Absicht. */
export interface GrantProps {
  userId: string
}

/**
 * Die `userId` aus den entschlüsselten Props eines Grants; `null`, wenn dort keine
 * brauchbare steht (der Aufrufer antwortet dann 401 — der Token trägt keine Identität,
 * die dieses System kennt).
 *
 * Der Doppelpunkt ist der einzige Zeichen-Ausschluss, und er ist strukturell: Das
 * Token-Format des Providers ist `userId:grantId:secret`. Eine `userId` mit `:` kann
 * über den regulären Weg gar nicht entstehen — käme sie hier trotzdem an, wäre etwas
 * an der Kette faul, und dann ist Abweisen die richtige Antwort.
 */
export function userIdAusProps(props: unknown): string | null {
  if (!props || typeof props !== 'object') {
    return null
  }

  const roh = (props as Partial<GrantProps>).userId
  if (typeof roh !== 'string') {
    return null
  }

  const userId = roh.trim()
  if (!userId || userId.includes(':')) {
    return null
  }

  return userId
}
