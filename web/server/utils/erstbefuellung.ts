import type { H3Event } from 'h3'
import { KoerperdatenArchive } from '@shared/garmin/koerperdatenArchive'
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'
import {
  fuehreErstbefuellungAus,
  reserviereErstbefuellung,
} from '@shared/garmin/koerperdatenErstbefuellung'
import { heuteInBerlin } from '@shared/zeitzone'

/**
 * Der Adapter, der die **Erstbefüllung** aus einem Request heraus anstößt (Issue #48).
 *
 * Reiner Adapter wie der Cron-Task: Die Fachlichkeit liegt im Garmin-Kontext
 * (`reserviereErstbefuellung` / `fuehreErstbefuellungAus`), hier werden nur Bindings,
 * „heute" und der Hintergrund-Kontext hereingereicht.
 *
 * **Im Hintergrund**, weil der Lauf 30 Tage sequentiell mit Pause holt — 40 bis 60
 * Sekunden, fast alles Warten. Sie an die Antwort des Verbindungs-Formulars zu hängen
 * hieße, den Athleten eine Minute vor ein hängendes Formular zu setzen, und liefe in
 * jedes Client-Timeout.
 *
 * Der Preis ist die fehlende Zustellgarantie: Bricht der Lauf ab, merkt es niemand.
 * Deshalb ist er wiederholbar und hinterlässt einen beobachtbaren Zustand — beides
 * steckt im Domänen-Modul, nicht hier.
 *
 * **Reserviert wird noch im Request**, ausgeführt im Hintergrund: Sonst antwortete die
 * Route, bevor „läuft gerade" im KV steht, und die Oberfläche fragte den Fortschritt
 * eines Laufs ab, von dem noch nichts zu sehen ist — genau das Loch, in dem ein
 * zweiter Klick landet.
 *
 * Der zurückgegebene Zustand ist der **nach** der Reservierung: `laeuft` in jedem Fall,
 * in dem etwas läuft — der eigene neue Lauf oder der schon laufende. `null` heißt, dass
 * gar nichts angestoßen wurde.
 *
 * **Wirft nie.** Der Hauptaufrufer ist das Verbinden selbst, und dort ist das
 * Speichern des DI-Bündels schon durch: Ein Fehler beim Anstoßen der Erstbefüllung
 * darf nicht als „Verbinden fehlgeschlagen" beim Athleten ankommen, während seine
 * Verbindung in Wahrheit steht. Er bekäme sonst ein Formular mit Fehlermeldung für
 * etwas, das er nur wiederholen kann — und das Wiederholen ist ein Knopf weiter unten.
 */
export async function starteErstbefuellungImHintergrund(
  event: H3Event,
  userId: string,
  env: Env,
): Promise<ErstbefuellungLauf | null> {
  let reserviert: boolean
  let lauf: ErstbefuellungLauf
  try {
    ({ reserviert, lauf } = await reserviereErstbefuellung(env.SESSION_KV, userId))
  } catch (err) {
    console.error(`Erstbefüllung ${userId} nicht angestoßen:`, err)
    return null
  }
  if (!reserviert) return lauf

  const ausfuehrung = fuehreErstbefuellungAus({
    kv: env.SESSION_KV,
    archiv: new KoerperdatenArchive(env.ATHLETE_DB),
    userId,
    heute: heuteInBerlin(),
    begonnen: lauf.begonnen,
  }).catch((err) => {
    // `fuehreErstbefuellungAus` fängt seine Fehler selbst; was hier ankäme, wäre ein
    // Fehler im KV-Schreiben des Zustands. Ungefangen wäre das eine unhandled
    // rejection, die in den Worker-Logs nach einem Absturz aussieht statt nach einem
    // KV-Ausfall.
    console.error(`Erstbefüllung ${userId} abgebrochen:`, err)
  })

  // Ohne `waitUntil` würde der Worker die Antwort ausliefern und die Ausführung
  // beenden, während der Lauf noch bei Garmin hängt. Nitro reicht die
  // `ExecutionContext` des Workers unter `event.context.cloudflare.context` durch —
  // dieselbe Stelle, an der auch die Grant-Props hängen (siehe `athlet.ts`).
  const ctx = (
    event.context as { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } }
  ).cloudflare?.context

  if (ctx?.waitUntil) {
    ctx.waitUntil(ausfuehrung)
  } else {
    // Sollte es nicht geben — außerhalb der Cloudflare-Laufzeit aber schon. Still
    // hinnehmen wäre die schlechteste Variante: Der Zustand stünde auf „läuft gerade",
    // der Lauf stürbe mit der Antwort, und auf dev sähe das nach einem Garmin-Problem
    // aus statt nach einer fehlenden ExecutionContext.
    console.warn(
      `Erstbefüllung ${userId}: keine ExecutionContext — der Lauf überlebt die Antwort möglicherweise nicht.`,
    )
  }

  return lauf
}
