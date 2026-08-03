import type { Farbname } from '~/composables/useChartFarben'

/**
 * Die Beschreibung einer Kurve im gemeinsamen Chart-Wrapper (Issue #24, erweitert
 * in #25). Ein Verlauf besteht aus mehreren solchen **Reihen** — der Wrapper trägt
 * daraus Achsen, Stapel und Farben zusammen, die Seite sagt nur, was sie zeigen
 * will. Chart.js taucht in keiner Seite auf.
 */
export interface Reihe {
  /** Beschriftung in Legende und Tooltip. */
  label: string
  /** Ein Wert je Tag der Achse; `null` ist eine Lücke und bleibt eine. */
  werte: (number | null)[]
  /**
   * Wie die Reihe gezeichnet wird. `flaeche` ist eine Linie, die bis zur
   * Nulllinie füllt (ein Hintergrund-Verlauf hinter der eigentlichen Aussage),
   * `balken` ein Wert je Tag als Säule.
   */
  art?: 'linie' | 'flaeche' | 'balken'
  farbe?: Farbname
  /**
   * Auf welcher der beiden y-Achsen die Reihe liegt. Zwei Achsen sind nötig,
   * sobald zwei Größen mit verschiedenen Einheiten nebeneinander gehören
   * (Bereitschaft gegen akute Last, Schlafdauer gegen Schlafscore).
   */
  achse?: 'links' | 'rechts'
  /**
   * Balken mit demselben Stapel-Namen werden übereinandergesetzt (Schlafphasen).
   * Ohne Namen steht die Reihe für sich — auch dann, wenn andere Reihen im selben
   * Chart gestapelt sind.
   */
  stapel?: string
  /**
   * Balken um die Nulllinie nach Vorzeichen einfärben — der Unterschied zwischen
   * einem Lade- und einem Zehrtag soll ins Auge fallen, nicht nachgemessen werden.
   */
  vorzeichenfarben?: boolean
  /** Gestrichelt zeichnen — für abgeleitete Linien wie ein rollierendes Mittel. */
  gestrichelt?: boolean
}

/** Eine Fläche zwischen zwei Grenzserien, z. B. das eigene HRV-Baseline-Band. */
export interface Band {
  label: string
  unten: (number | null)[]
  oben: (number | null)[]
}
