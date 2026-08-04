import {
  berechneKennzahlen,
  berechneSerien,
  letzteTage,
} from '@shared/garmin/koerperdatenSerien'
import { berechneIndex } from '@shared/garmin/koerperdatenIndex'
import { ZEITRAEUME, alsZeitraumName } from '#shared/zeitraum'

// Bereichs-Endpunkt der Körperdaten-Verläufe (Issue #24, erweitert in #25): liefert die
// **abgeleiteten Serien** eines Zeitraums, nicht die Rohblobs — ein Tag wiegt so rund
// 120 Byte statt rund 1,5 kB, und die Lückenbehandlung liegt im getesteten Modul statt
// in der Vue-Schicht. Dazu die Kennzahlen der Kachelzeile und der Körperdaten-Index
// (Issue #26) — Verlauf und aktueller Stand samt Aufschlüsselung, ebenfalls fertig
// gerechnet: die gesamte Bewertungspolitik liegt in koerperdatenIndex, nicht hier.
// Gelesen über das bestehende KoerperdatenArchive (resolveKoerperdaten), unbekanntes
// Secret → 404.
//
// Neben den benannten Ausschnitten (`?zeitraum=30|90|alles`) akzeptiert die Route ein
// explizites `?von=YYYY-MM-DD&bis=YYYY-MM-DD` (Issue #28): der Rücksprung vom
// Körperdaten-Streifen der Steuerungs-Wochenseite braucht genau den Zeitraum einer
// Woche, keinen der drei festen Ausschnitte. Sind beide Daten gültig, haben sie
// Vorrang vor `zeitraum` — die bestehende Form bleibt für alle anderen Aufrufer
// unverändert.

/** `YYYY-MM-DD` — mehr Form prüfen wir hier nicht, den Rest erledigt der Vergleich. */
const DATUM_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export default defineEventHandler(async (event) => {
  const { userId, archiv } = await resolveKoerperdaten(event)

  const query = getQuery(event)
  const heute = heuteInBerlin()

  const explizit
    = typeof query.von === 'string'
      && typeof query.bis === 'string'
      && DATUM_PATTERN.test(query.von)
      && DATUM_PATTERN.test(query.bis)
      && query.von <= query.bis
      ? { von: query.von, bis: query.bis }
      : null

  const name = alsZeitraumName(query.zeitraum)
  const anzahl = ZEITRAEUME[name]

  // „Alles" spannt vom ersten archivierten Tag bis heute. Ohne diesen Anfang müsste die
  // Achse geraten werden, und wer seit zwei Monaten dabei ist, bekäme Jahre leerer
  // Achse vor seinen Verlauf gesetzt. Ganz ohne Archiv bleibt es beim Standard-Fenster.
  const zeitraum
    = explizit
      ?? (anzahl === null
        ? { von: (await archiv.firstDate(userId)) ?? letzteTage(heute, 30).von, bis: heute }
        : letzteTage(heute, anzahl))

  const tage = await archiv.readRange(userId, zeitraum.von, zeitraum.bis)
  const serien = berechneSerien(tage, zeitraum)

  return {
    user: userId,
    zeitraum: name,
    von: zeitraum.von,
    bis: zeitraum.bis,
    serien,
    kennzahlen: berechneKennzahlen(serien),
    index: berechneIndex(serien),
  }
})
