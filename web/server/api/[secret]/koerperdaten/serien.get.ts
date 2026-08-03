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

/**
 * Heutiges Datum in der Zeitzone des Athleten als YYYY-MM-DD (en-CA liefert
 * ISO-Reihenfolge). Garmin datiert die Tagesblobs lokal — über UTC gerechnet läge
 * der Zeitraum nachts um einen Tag daneben.
 */
function heuteInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

export default defineEventHandler(async (event) => {
  const { userId, archiv } = await resolveKoerperdaten(event)

  const name = alsZeitraumName(getQuery(event).zeitraum)
  const heute = heuteInBerlin()
  const anzahl = ZEITRAEUME[name]

  // „Alles" spannt vom ersten archivierten Tag bis heute. Ohne diesen Anfang müsste die
  // Achse geraten werden, und wer seit zwei Monaten dabei ist, bekäme Jahre leerer
  // Achse vor seinen Verlauf gesetzt. Ganz ohne Archiv bleibt es beim Standard-Fenster.
  const zeitraum
    = anzahl === null
      ? { von: (await archiv.firstDate(userId)) ?? letzteTage(heute, 30).von, bis: heute }
      : letzteTage(heute, anzahl)

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
