import { fehlerMeldung } from '#shared/fehlerMeldung'
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'

/**
 * Die *Erstbefüllung* anstoßen — für die zwei Flächen, die einen Knopf dafür haben: die
 * Karte auf der Startseite (Issue #51) und den Knopf unter der Garmin-Karte in den
 * Einstellungen (Issue #48).
 *
 * Gemeinsam, weil beide dasselbe tun und beim Scheitern dasselbe sagen müssen. Zwei
 * Fassungen desselben POST liefen genau dort auseinander, wo es auffällt: im Satz, den
 * der Athlet nach einem Fehlschlag liest.
 *
 * Der Aufrufer bekommt den Lauf **aus der Antwort** zurück und soll ihn übernehmen,
 * statt sofort nachzufragen: Der Zustand liegt im KV und ist *eventually consistent* —
 * ein Abruf in derselben Sekunde sähe die Reservierung womöglich noch nicht und böte
 * den Knopf ein zweites Mal an. `null` heißt gescheitert, `fehler` sagt warum.
 */
export function useErstbefuellungStart() {
  const laeuftAn = ref(false)
  const fehler = ref<string | null>(null)

  async function starten(): Promise<ErstbefuellungLauf | null> {
    laeuftAn.value = true
    fehler.value = null
    try {
      const { lauf } = await $fetch('/api/verbindungen/garmin/erstbefuellung', {
        method: 'POST',
      })
      return lauf
    } catch (e) {
      // Die Route schreibt ihre Meldungen für den Athleten (etwa „Verbinde zuerst
      // Garmin"); nur wenn keine ankommt, steht hier eine eigene.
      fehler.value = fehlerMeldung(
        e,
        'Das Holen hat nicht geklappt. Bitte versuch es noch einmal.',
      )
      return null
    } finally {
      laeuftAn.value = false
    }
  }

  return { laeuftAn, fehler, starten }
}
