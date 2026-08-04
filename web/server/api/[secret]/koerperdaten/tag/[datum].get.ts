import { isoWoche } from '@shared/garmin/isoWoche'

// Der volle archivierte Tagesblob eines Datums (Issue #27) — die Grundlage der
// Tages-Detailansicht. Bewusst ein eigener Endpunkt neben dem Bereichs-Endpunkt:
// dessen Antwort ist auf ~120 Byte je Tag geschnitten und trägt die einzelnen
// Training-Readiness-Readings und die Body-Battery-Ereignisse gar nicht mit. Genau
// die sind hier aber die Aussage (ADR-0002), also kommt der Blob unverändert heraus,
// wie er archiviert ist — nichts wird zusammengefasst, nichts übersetzt.
//
// Gelesen über dasselbe KoerperdatenArchive wie überall (resolveKoerperdaten);
// unbekanntes Secret → 404, wie bei allen Routen dieser Fläche.
//
// Ein Datum ohne Archivzeile ist **kein** Fehler, sondern `tag: null`: wer die Uhr
// nicht getragen hat, soll eine leere Ansicht sehen und keine Fehlerseite.

/** `YYYY-MM-DD` — alles andere kann kein archivierter Tag sein. */
const DATUM_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * True für ein Datum, das es auch gibt. Das Muster allein reicht nicht: „2026-02-31"
 * hat die richtige Form, ist aber kein Tag — und `isoWoche` würfe darauf, was aus
 * einer erfundenen URL einen 500er statt eines 404ers machte.
 */
function istDatum(datum: string): boolean {
  if (!DATUM_PATTERN.test(datum)) return false
  const d = new Date(`${datum}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(datum)
}

export default defineEventHandler(async (event) => {
  const { userId, archiv } = await resolveKoerperdaten(event)

  const datum = getRouterParam(event, 'datum')!
  if (!istDatum(datum)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return {
    user: userId,
    datum,
    // Der Wochen-Key kommt mit: der Sprung in die Steuerungs-Woche ist Teil der
    // Auskunft über diesen Tag, und die Brücke (isoWoche) liegt an einer Stelle.
    kw: isoWoche(datum),
    tag: await archiv.read(userId, datum),
  }
})
