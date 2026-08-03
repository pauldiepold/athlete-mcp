import { berechneSerien, letzteTage } from '@shared/garmin/koerperdatenSerien'

// Bereichs-Endpunkt der Körperdaten-Verläufe (Issue #24): liefert die **abgeleiteten
// Serien** eines Zeitraums, nicht die Rohblobs — ein Tag wiegt so rund 120 Byte statt
// rund 1,5 kB, und die Lückenbehandlung liegt im getesteten Modul statt in der
// Vue-Schicht. Gelesen über das bestehende KoerperdatenArchive (resolveKoerperdaten),
// unbekanntes Secret → 404.
//
// Zeitraum in diesem Slice fest auf die letzten 30 Tage; der Umschalter kommt mit
// Issue #25 und wird dann hier zum Query-Parameter.
const ZEITRAUM_TAGE = 30

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

  const zeitraum = letzteTage(heuteInBerlin(), ZEITRAUM_TAGE)
  const tage = await archiv.readRange(userId, zeitraum.von, zeitraum.bis)

  return {
    user: userId,
    von: zeitraum.von,
    bis: zeitraum.bis,
    serien: berechneSerien(tage, zeitraum),
  }
})
