/**
 * Der Anzeigename aus Apples `user`-Feld.
 *
 * Zwei Eigenheiten, die zusammen genau die Sorte Fehler ergeben, die still passiert:
 * Das Feld ist ein JSON-**String**, kein Objekt (der Handler reicht durch, was
 * `readBody` aus dem `x-www-form-urlencoded`-Body liest), und Apple schickt es **genau
 * einmal** — bei der allerersten Autorisierung eines Nutzers, ohne Fehler und ohne
 * Hinweis danach.
 *
 * Deshalb wird hier defensiv geparst: Ein kaputtes oder fehlendes Feld darf keinen
 * Login kippen. Der Name ist Komfort — er ist die Vorbelegung eines Formularfelds,
 * das der Athlet ohnehin bestätigt. Fehlt er, bleibt das Feld leer.
 */
export function appleAnzeigename(userFeld: unknown): string {
  const roh = typeof userFeld === 'string' ? sichereJson(userFeld) : userFeld
  if (!roh || typeof roh !== 'object') {
    return ''
  }

  const name = (roh as { name?: unknown }).name
  if (!name || typeof name !== 'object') {
    return ''
  }

  const { firstName, lastName } = name as { firstName?: unknown; lastName?: unknown }
  return [firstName, lastName]
    .filter((teil): teil is string => typeof teil === 'string')
    .map((teil) => teil.trim())
    .filter((teil) => teil.length > 0)
    .join(' ')
}

function sichereJson(wert: string): unknown {
  try {
    return JSON.parse(wert)
  } catch {
    return null
  }
}
