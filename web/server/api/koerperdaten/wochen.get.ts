import { isValidKw, SteuerungStore } from '@shared/steuerung/steuerungStore'
import { KoerperdatenArchive } from '@shared/garmin/koerperdatenArchive'
import { berechneSerien, letzteTage } from '@shared/garmin/koerperdatenSerien'
import { berechneIndex } from '@shared/garmin/koerperdatenIndex'
import { berechneWochenAggregate } from '@shared/garmin/koerperdatenWochen'
import { wochenZeitraum } from '@shared/garmin/isoWoche'
import { heuteInBerlin } from '@shared/zeitzone'

// Wochen-Aggregat-Endpunkt der Steuerungs-Brücke (Issue #28): die gemeinsame
// Datengrundlage beider Richtungen — die Dashboard-Wochenliste (Richtung 1) und der
// Körperdaten-Streifen der Steuerungs-Wochenseite (Richtung 2). Gelesen über dasselbe
// KoerperdatenArchive und denselben SteuerungStore wie überall, Auth und 404 über die
// gemeinsame Athleten-Auflösung (resolveAthlet). Die eigentliche Rechnung liegt komplett
// in koerperdatenWochen; hier steht nur, welcher Zeitraum gelesen wird.
//
// Ohne `?kw` liest die Route die volle Archiv-Historie (wie „Alles" im
// Bereichs-Endpunkt) und liefert alle Wochen, die entweder Körperdaten oder einen
// Steuerungseintrag haben — die Grundlage der Dashboard-Wochenliste.
//
// Mit `?kw=YYYY-Www` liest sie nur ein knappes Fenster: die sieben Tage dieser Woche
// (`wochenZeitraum`) plus 27 Tage Vorlauf, gerade genug für den 28-Tage-Ruhepuls-Median
// aus koerperdatenIndex — derselbe Bezugswert, den auch die Dashboard-Kachel zeigt,
// ohne die ganze Historie zu lesen. Das Ergebnis wird auf diese eine Woche gefiltert
// (0 oder 1 Eintrag); ungültiges kw → 400, wie bei den Steuerungs-Wochen-Routen.
//
// Zu jeder Woche mit Steuerungseintrag kommt ihr Auszug (`wochenAuszug`) dazu — dafür
// einmal `getWoche` je solcher Woche, weil der Store keinen Bulk-Read kennt.

/** `YYYY-Www` — dasselbe Format, das der Steuerungs-Store verlangt. */
function alsKwOderUndefined(wert: unknown): string | undefined {
  return typeof wert === 'string' ? wert : undefined
}

export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)
  const archiv = new KoerperdatenArchive(env.ATHLETE_DB)
  const steuerung = new SteuerungStore(env.ATHLETE_DB)

  const kw = alsKwOderUndefined(getQuery(event).kw)
  if (kw !== undefined && !isValidKw(kw)) {
    throw createError({ statusCode: 400, statusMessage: 'kw im ISO-Format YYYY-Www erforderlich' })
  }

  const heute = heuteInBerlin()
  const zeitraum
    = kw !== undefined
      // 27 Tage Vorlauf + die 7 Tage der Woche selbst = 34 — genug für den
      // 28-Tage-Median der Ruhepuls-Achse, ohne die volle Historie zu lesen.
      ? letzteTage(wochenZeitraum(kw).bis, 34)
      : { von: (await archiv.firstDate(userId)) ?? letzteTage(heute, 30).von, bis: heute }

  const [tage, steuerungsWochen] = await Promise.all([
    archiv.readRange(userId, zeitraum.von, zeitraum.bis),
    steuerung.listWochen(userId),
  ])

  const serien = berechneSerien(tage, zeitraum)
  const index = berechneIndex(serien)

  const aggregate = berechneWochenAggregate(
    {
      tage: serien.tage,
      indexSerie: index.serie,
      hrvNachtwert: serien.hrv.nachtwert,
      schlafStunden: serien.schlaf.gesamt_stunden,
      akuteLast: serien.bereitschaft.akute_last,
    },
    steuerungsWochen,
  )

  const gefiltert = kw !== undefined ? aggregate.filter((w) => w.kw === kw) : aggregate

  const wochen = await Promise.all(
    gefiltert.map(async (woche) => ({
      ...woche,
      auszug: woche.hatSteuerungseintrag
        ? wochenAuszug(await steuerung.getWoche(userId, woche.kw))
        : null,
    })),
  )

  return { user: userId, wochen }
})
