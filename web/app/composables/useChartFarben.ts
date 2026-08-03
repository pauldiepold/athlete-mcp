/**
 * Chart-Farben aus den CSS-Variablen von Nuxt UI (Issue #24). Damit trägt jeder
 * Chart dieselbe Palette wie der Rest der Oberfläche und Hell/Dunkel funktioniert
 * ohne Sonderweg — die Variablen sind je Farbschema anders belegt, wir lesen sie
 * nur aus.
 *
 * Warum der Umweg über ein Canvas-Pixel: Nuxt UI belegt die Variablen mit
 * modernen Farbräumen (oklch). Chart.js parst Farben selbst (u. a. für Flächen und
 * Hover-Zustände) und versteht dort nur klassische Notationen. Der Browser rechnet
 * jede gültige CSS-Farbe für uns um, wenn wir sie in ein 1×1-Canvas malen und das
 * Pixel zurücklesen — so bekommen wir garantiert ein `rgba()` und können die
 * Deckkraft frei setzen (Bandflächen).
 */

/** Die Nuxt-UI-Variablen, aus denen sich unsere Charts bedienen. */
const VARIABLEN = {
  /** Akzentfarbe der Oberfläche — die Hauptlinie und ihr Band. */
  primaer: '--ui-primary',
  /** Zweite, ruhigere Linie (z. B. ein Wochenschnitt). */
  sekundaer: '--ui-info',
  /** Dritte Reihe, wo drei Kurven nebeneinander unterscheidbar sein müssen. */
  tertiaer: '--ui-secondary',
  /** Die gute Richtung — Ladetage, Schlafscore. */
  erfolg: '--ui-success',
  /** Die zehrende Richtung — Zehrtage, Wachanteil, Temperatur-Abweichung. */
  warnung: '--ui-warning',
  /** Achsenbeschriftung, Legende — und ruhige, abgeleitete Linien. */
  gedaempft: '--ui-text-muted',
  /** Gitterlinien. */
  gitter: '--ui-border',
} as const

export type Farbname = keyof typeof VARIABLEN

/** Malt die Farbe in ein 1×1-Canvas und liest das Pixel als rgba() zurück. */
function alsRgba(farbe: string, deckkraft: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return farbe

  // Ungültige/leere Werte lassen fillStyle unverändert — dann ist es Schwarz,
  // also sichtbar statt still verschluckt.
  ctx.fillStyle = farbe
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${deckkraft})`
}

export function useChartFarben() {
  const colorMode = useColorMode()

  // Die Variablen stehen erst im Browser (und je nach Farbschema anders). Der
  // Zähler ist der Reaktivitäts-Anker: jede Änderung lässt abhängige Computeds
  // die Farben neu lesen.
  const stand = ref(0)
  onMounted(() => stand.value++)
  watch(() => colorMode.value, () => stand.value++)

  /** Eine Nuxt-UI-Farbe als `rgba()`, optional mit Deckkraft (0–1). */
  function farbe(name: Farbname, deckkraft = 1): string {
    void stand.value
    if (!import.meta.client) return 'transparent'

    const wert = getComputedStyle(document.documentElement)
      .getPropertyValue(VARIABLEN[name])
      .trim()
    return alsRgba(wert, deckkraft)
  }

  return { farbe }
}
