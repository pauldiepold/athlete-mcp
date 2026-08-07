import {
  berechneKennzahlen,
  berechneSerien,
  letzteTage,
} from '@shared/garmin/koerperdatenSerien'
import { berechneIndex } from '@shared/garmin/koerperdatenIndex'
import { wochenZeitraum } from '@shared/garmin/isoWoche'
import { isValidKw } from '@shared/steuerung/steuerungStore'
import { ZEITRAEUME, alsZeitraumName } from '#shared/zeitraum'
import { heuteInBerlin } from '@shared/zeitzone'

// Bereichs-Endpunkt der Körperdaten-Verläufe (Issue #24, erweitert in #25): liefert die
// **abgeleiteten Serien** eines Zeitraums, nicht die Rohblobs — ein Tag wiegt so rund
// 120 Byte statt rund 1,5 kB, und die Lückenbehandlung liegt im getesteten Modul statt
// in der Vue-Schicht. Dazu die Kennzahlen der Kachelzeile und der Körperdaten-Index
// (Issue #26) — Verlauf und aktueller Stand samt Aufschlüsselung, ebenfalls fertig
// gerechnet: die gesamte Bewertungspolitik liegt in koerperdatenIndex, nicht hier.
// Gelesen über das bestehende KoerperdatenArchive (resolveKoerperdaten), unbekanntes
// Session → 401.
//
// Neben den benannten Ausschnitten (`?zeitraum=30|90|alles`) akzeptiert die Route eine
// einzelne Woche als `?kw=YYYY-Www` (Issue #28): die Wochenliste des Dashboards und der
// Rücksprung vom Körperdaten-Streifen der Steuerungs-Wochenseite wählen genau die sieben
// Tage einer Kalenderwoche, für die keiner der drei festen Ausschnitte passt. Bewusst der
// Wochen-Key statt eines freien Von/Bis: er ist derselbe Schlüssel, unter dem der
// Steuerungs-Store seine Woche führt, und die Fläche kann daraus ohne Rückrechnung in die
// Steuerungswoche verlinken. Ist `kw` gesetzt, hat es Vorrang vor `zeitraum`.

export default defineEventHandler(async (event) => {
  const { userId, archiv } = await resolveKoerperdaten(event)

  const query = getQuery(event)
  const heute = heuteInBerlin()

  const kw = typeof query.kw === 'string' ? query.kw : null
  if (kw !== null && !isValidKw(kw)) {
    throw createError({ statusCode: 400, statusMessage: 'kw im ISO-Format YYYY-Www erforderlich' })
  }

  const name = alsZeitraumName(query.zeitraum)
  const anzahl = ZEITRAEUME[name]

  // „Alles" spannt vom ersten archivierten Tag bis heute. Ohne diesen Anfang müsste die
  // Achse geraten werden, und wer seit zwei Monaten dabei ist, bekäme Jahre leerer
  // Achse vor seinen Verlauf gesetzt. Ganz ohne Archiv bleibt es beim Standard-Fenster.
  const zeitraum
    = kw !== null
      ? wochenZeitraum(kw)
      : (anzahl === null
          ? { von: (await archiv.firstDate(userId)) ?? letzteTage(heute, 30).von, bis: heute }
          : letzteTage(heute, anzahl))

  const tage = await archiv.readRange(userId, zeitraum.von, zeitraum.bis)
  const serien = berechneSerien(tage, zeitraum)

  return {
    user: userId,
    zeitraum: name,
    kw,
    von: zeitraum.von,
    bis: zeitraum.bis,
    serien,
    kennzahlen: berechneKennzahlen(serien),
    index: berechneIndex(serien),
  }
})
