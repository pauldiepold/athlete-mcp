/**
 * Reines Modul: die Brücke zwischen einem **Körperdaten-Tag** und der **Woche**
 * des Steuerungs-Stores. Ein Datum (`YYYY-MM-DD`) geht hinein, der Wochen-Key
 * (`YYYY-Www`) kommt heraus — genau die Form, die `SteuerungStore` als Schlüssel
 * annimmt und streng validiert (`isValidKw`).
 *
 * Warum ein eigenes Modul für eine Zeile Kalender-Arithmetik: ISO 8601 bindet die
 * Woche an ihren **Donnerstag**, nicht an ihren Kalendertag. Der 1. Januar gehört
 * deshalb oft noch ins Vorjahr (`2021-01-01` → `2020-W53`) und die letzten
 * Dezembertage oft schon ins Folgejahr (`2019-12-30` → `2020-W01`). Wer stattdessen
 * das Kalenderjahr nimmt, bekommt keinen Fehler, sondern einen **falschen
 * Schlüssel** — der Tag hinge dann still am falschen Wocheneintrag. Deshalb liegt
 * die Rechnung an einer Stelle und ist getestet.
 *
 * Rein — kein D1, kein Netz, keine Uhr und keine Zeitzone: gerechnet wird auf
 * UTC-Mitternacht, weil der Tagesblob ohnehin schon lokal datiert ist.
 */

/** `YYYY-MM-DD` — mehr Form prüfen wir nicht, den Rest erledigt `Date`. */
const DATUM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Der Wochen-Key des Tages `datum` (`YYYY-MM-DD`), z. B. `2026-W24`. Das Jahr im
 * Schlüssel ist das **Wochen-Jahr**, nicht zwingend das Kalenderjahr des Tages.
 *
 * Wirft bei einem Wert, der kein Datum ist: ein stiller `NaN-WNaN` würde als
 * Schlüssel weitergereicht und wäre erst am leeren Wocheneintrag zu bemerken.
 */
export function isoWoche(datum: string): string {
  const d = new Date(`${datum}T00:00:00Z`);
  if (!DATUM_PATTERN.test(datum) || Number.isNaN(d.getTime())) {
    throw new Error(`Ungültiges Datum "${datum}": erwartet YYYY-MM-DD.`);
  }

  // Der Donnerstag derselben Woche entscheidet über Jahr und Nummer (ISO 8601):
  // die Woche gehört dem Jahr, in dem die meisten ihrer Tage liegen.
  const seitMontag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - seitMontag + 3);

  const jahr = d.getUTCFullYear();
  const tagImJahr = (d.getTime() - Date.UTC(jahr, 0, 1)) / 86_400_000 + 1;
  const woche = Math.ceil(tagImJahr / 7);

  // Zweistellig, weil der Store genau das verlangt und weil ein „W7" die
  // lexikografische Sortierung der Wochen-Keys zerlegen würde.
  return `${jahr}-W${String(woche).padStart(2, "0")}`;
}

/** `YYYY-Www` — das Format, das `SteuerungStore` verlangt (`isValidKw`). */
const KW_PATTERN = /^(\d{4})-W(\d{2})$/;

/**
 * Die sieben Kalendertage der Woche `kw`, Montag bis Sonntag — die Umkehrung
 * von `isoWoche`: für jeden Tag `t` im zurückgegebenen Zeitraum gilt
 * `isoWoche(t) === kw`. Gebraucht von der Steuerungs-Brücke (Issue #28): der
 * Körperdaten-Streifen einer Steuerungs-Woche braucht genau ihre sieben Tage,
 * nicht die ganze Archiv-Historie.
 *
 * Wirft bei einem `kw`, das nicht dem Format `YYYY-Www` entspricht.
 */
export function wochenZeitraum(kw: string): { von: string; bis: string } {
  const match = KW_PATTERN.exec(kw);
  if (!match) {
    throw new Error(`Ungültiger Wochen-Key "${kw}": erwartet YYYY-Www.`);
  }

  const jahr = Number(match[1]);
  const woche = Number(match[2]);

  // Der 4. Januar liegt nach ISO 8601 immer in Woche 1 (er ist niemals mehr als
  // drei Tage vom Jahresanfang entfernt) — sein Montag ist der Ankerpunkt, von
  // dem aus jede weitere Woche in Sieben-Tage-Schritten folgt.
  const jan4 = new Date(Date.UTC(jahr, 0, 4));
  const seitMontag = (jan4.getUTCDay() + 6) % 7;
  const montag = new Date(jan4);
  montag.setUTCDate(jan4.getUTCDate() - seitMontag + (woche - 1) * 7);

  const sonntag = new Date(montag);
  sonntag.setUTCDate(montag.getUTCDate() + 6);

  return {
    von: montag.toISOString().slice(0, 10),
    bis: sonntag.toISOString().slice(0, 10),
  };
}
