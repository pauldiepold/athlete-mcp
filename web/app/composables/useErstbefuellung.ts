import { fehlerMeldung } from '#shared/fehlerMeldung'
import type { Taktwunsch } from '#shared/erstbefuellung'
import { erstbefuellungsFall, knopfAktiv, taktIntervall } from '#shared/erstbefuellung'
import { ABFRAGE_INTERVALL_LAEUFT_MS } from '#shared/startseitenZustand'
import type { ErstbefuellungLauf } from '@shared/garmin/koerperdatenErstbefuellung'

export interface ErstbefuellungOptionen {
  /**
   * Wie oft **diese** Fläche den Stand nachgefragt haben will. Ohne Angabe der
   * voreingestellte Wunsch: eng während eines Laufs, sonst gar nicht — das, was eine
   * Fläche braucht, die nur den Lauf zeigt.
   *
   * Die **Startseite** reicht ihren eigenen Wunsch herein, denn sie fragt auch in den
   * wartenden Zuständen ruhig weiter. Ein Ref und kein Wert: Der Wunsch ändert sich mit
   * dem Zustand, und wer ihn stellt, montiert deswegen nicht neu.
   *
   * Wünschen darf jeder; **ein** Intervall entsteht daraus trotzdem (`taktIntervall`).
   */
  takt?: Ref<Taktwunsch>
  /**
   * Was diese Fläche zusätzlich zum Stand nachzieht, wenn ihr Wunsch ihn fällig macht.
   * Die Startseite hängt hier Einrichtung und Verbindungen ein: Bei offener Einrichtung
   * sind die Verbindungen **Inhalt** der Liste, und wer im zweiten Tab verbindet,
   * wechselt keinen Zustand, sondern hakt einen Schritt darin ab.
   *
   * Der Stand selbst steht bewusst **nicht** hier drin — er wird pro Takt genau einmal
   * geholt, egal wie viele Flächen gerade zusehen.
   */
  ziehtNach?: () => void
}

/**
 * Die *Erstbefüllung* (Issue #48) als **ein** Modul: der Abruf, der Takt, das Anstoßen
 * und das Übernehmen des angestoßenen Laufs.
 *
 * Es gibt genau einen Lauf — einen KV-Eintrag —, und vorher gab es drei Wege zu ihm:
 * zwei Endpunkte, zwei Timer, zwei Stellen, die den frisch angestoßenen Lauf optimistisch
 * übernahmen. Auf `/einstellungen` liefen davon zwei gleichzeitig, weil der Knopf dort
 * **zweimal** montiert ist (unter der Garmin-Karte und im Einrichtungs-Schritt). Was
 * auseinanderlaufen kann, lief auseinander; hier läuft es zusammen.
 *
 * **Geteilt, nicht durchgereicht.** Der Knopf hat zwei unabhängige Eltern, die sich
 * dafür absprechen müssten. Geteilt wird über den `useFetch`-Key (die Daten) und die
 * Anmeldung am Takt unten (das Intervall) — beides ohne Zutun der Aufrufer. Wer
 * zusieht, sagt nur, wie oft er es gern hätte; wie oft wirklich gefragt wird,
 * entscheidet `taktIntervall` über alle Wünsche zusammen.
 */
export function useErstbefuellung({ takt, ziehtNach }: ErstbefuellungOptionen = {}) {
  const { loggedIn } = useUserSession()

  // Derselbe Abruf, den die Startseite für ihren Zustand liest (Issue #51): ein Lauf,
  // ein beobachtender Endpunkt. `offen` kommt aus demselben Blick ins Archiv, den auch
  // das Anstoßen macht — deshalb sagen Knopf und Route dasselbe.
  const { data, refresh, status } = useFetch('/api/koerperdaten/stand', {
    key: 'koerperdaten-stand',
    // Abgemeldet gibt es nichts zu holen — wie bei den Verbindungen käme nur ein 401
    // zurück, den in der Anmelde-Hälfte der Startseite niemand sehen soll.
    immediate: loggedIn.value,
    default: () => ({
      garminVerbunden: false,
      hatKoerperdaten: false,
      lauf: null as ErstbefuellungLauf | null,
      offen: null as number | null,
    }),
  })

  const lauf = computed(() => data.value?.lauf ?? null)
  const offen = computed(() => data.value?.offen ?? null)
  const laeuft = computed(() => lauf.value?.status === 'laeuft')

  /**
   * Welcher Fall vorliegt, entscheidet die reine Fassung in `#shared/erstbefuellung` —
   * die Fall-Reihenfolge ist das Eigentliche daran und in einer Template-Kette nicht
   * prüfbar. Den **Satz** dazu formuliert jede Fläche selbst: Der Knopf redet einzeilig
   * und nebenbei, die Karte auf der Startseite mit Überschrift und zwei Sätzen.
   */
  const fall = computed(() => erstbefuellungsFall({ lauf: lauf.value, offen: offen.value }))
  const aktiv = computed(() => knopfAktiv(fall.value))

  /**
   * Der voreingestellte Wunsch: nur während eines Laufs, und dann eng. Der Lauf meldet
   * sich nicht von selbst zurück — er lebt in einem anderen Request —, und außerhalb
   * ändert sich ohne Zutun des Athleten nichts, wofür jemand auf die Sekunde wartet.
   */
  const wunsch = takt ?? computed(() => (laeuft.value ? ABFRAGE_INTERVALL_LAEUFT_MS : null))

  if (import.meta.client) meldeAmTaktAn(wunsch, refresh, ziehtNach)

  const laeuftAn = ref(false)
  const fehler = ref<string | null>(null)

  /**
   * Die Erstbefüllung anstoßen — der eine Weg durch den POST, damit der Satz nach einem
   * Fehlschlag an beiden Flächen derselbe bleibt.
   *
   * Warum es den Knopf überhaupt gibt: Für einen Hintergrundlauf gibt es keine
   * Zustellgarantie. Bricht er ab — Worker beendet, Garmin ratelimitet —, merkt es sonst
   * niemand. Er ist deshalb der reguläre zweite Versuch und kein Reparatur-Sonderweg.
   *
   * Der Lauf aus der **Antwort** wird sofort übernommen, statt neu zu fragen: Der
   * Zustand liegt im KV und ist *eventually consistent* — ein Abruf in derselben Sekunde
   * sähe die Reservierung womöglich noch nicht, die Fläche fiele auf „keine Daten"
   * zurück und böte den Knopf ein zweites Mal an. Der Takt holt den Rest von selbst nach.
   *
   * `null` aus der Antwort heißt dagegen: Es wurde nichts angestoßen, weil nichts offen
   * war. Dann wird nachgefragt — die offenen Tage stammen aus D1 und sind stark
   * konsistent, die Antwort darauf stimmt sofort. Ohne das bliebe genau hier ein Knopf
   * stehen, der nichts tut.
   */
  async function anstossen() {
    laeuftAn.value = true
    fehler.value = null
    try {
      const { lauf: neuerLauf } = await $fetch('/api/verbindungen/garmin/erstbefuellung', {
        method: 'POST',
      })

      if (neuerLauf) {
        if (data.value) data.value = { ...data.value, lauf: neuerLauf }
        return
      }

      await refresh()
    } catch (e) {
      // Die Route schreibt ihre Meldungen für den Athleten (etwa „Verbinde zuerst
      // Garmin"); nur wenn keine ankommt, steht hier eine eigene.
      fehler.value = fehlerMeldung(
        e,
        'Das Holen hat nicht geklappt. Bitte versuch es noch einmal.',
      )
    } finally {
      laeuftAn.value = false
    }
  }

  return {
    /** Die ganze Antwort — die Startseite liest daraus ihre eigenen Eingaben. */
    stand: data,
    status,
    refresh,
    lauf,
    offen,
    laeuft,
    fall,
    /** Ob der Knopf etwas auszurichten hätte. */
    aktiv,
    /** Läuft gerade der POST? (Nicht: läuft der Abruf bei Garmin.) */
    laeuftAn,
    fehler,
    anstossen,
  }
}

interface Anmeldung {
  /** Wie oft diese Fläche gefragt haben will. */
  wunsch: Ref<Taktwunsch>
  /** Was sie zusätzlich zum Stand nachzieht, wenn ihr Wunsch fällig ist. */
  ziehtNach?: () => void
}

/**
 * Der Abfrage-Takt auf den Erstbefüllungs-Lauf: **ein** `setInterval` für alle, die
 * zusehen — im Browser und ohne Zutun der Aufrufer.
 *
 * Wer zusieht, meldet sich mit einem Wunsch an; wie oft wirklich gefragt wird, rechnet
 * `taktIntervall` aus allen Wünschen zusammen (der kleinste gewinnt, `null` heißt gar
 * nicht). Vorher hing der Takt am Aufrufer: Der Knopf zog seinen eigenen auf, die
 * Startseite ihren, und weil die Einrichtungs-Karte mit dem Knopf darin bei offener
 * Einrichtung **auf der Startseite** steht, liefen während eines Laufs beide gleichzeitig
 * auf denselben Abruf. Dem Knopf den Takt einfach abzuschalten half nicht: Auf
 * `/einstellungen` ist derselbe Knopf der einzige Beobachter weit und breit.
 *
 * Der Stand wird pro Takt **einmal** geholt, nicht einmal je Anmeldung — sonst wäre das
 * eine Intervall nur eine andere Schreibweise für dieselbe Doppelanfrage. Was eine
 * Fläche darüber hinaus nachzieht, ist ihre Sache und läuft nur, solange sie selbst
 * etwas will. Wer sich einen weiteren Takt gewünscht hat, wird dabei im engeren
 * mitgenommen; die beiden Wünsche im Haus fallen genau dort zusammen, wo sie sich
 * überhaupt treffen: Während eines Laufs wollen Knopf und Startseite dieselben zehn
 * Sekunden.
 *
 * Das Intervall gehört deshalb **keiner** Komponente: Es liegt in einer eigenen,
 * abgekoppelten Effekt-Umgebung im Modul, die erst mit der letzten Anmeldung abgebaut
 * wird. An der ersten Montage aufgehängt endete es, sobald die wieder geht — auf
 * `/einstellungen` also beim Zuklappen eines Einrichtungs-Schritts, während der Knopf
 * unter der Garmin-Karte weiter dastand und nie wieder etwas Neues erfuhr.
 *
 * Nur im Browser, und deshalb sind die Modul-Variablen hier ungefährlich: Beim
 * Serverrendern gäbe es niemanden, dem das Nachfragen etwas zeigt — Nuxt bricht bei
 * `setInterval` im SSR ab —, und geteilter Modul-Zustand auf dem Server liefe quer über
 * die Requests verschiedener Athleten.
 */
const anmeldungen = shallowRef<Anmeldung[]>([])
let taktUmgebung: ReturnType<typeof effectScope> | undefined

function meldeAmTaktAn(
  wunsch: Ref<Taktwunsch>,
  standNeu: () => Promise<void>,
  ziehtNach?: () => void,
) {
  const anmeldung: Anmeldung = { wunsch, ziehtNach }
  anmeldungen.value = [...anmeldungen.value, anmeldung]

  // Die erste Anmeldung zieht die Umgebung auf; alle weiteren hängen sich in dieselbe.
  // `standNeu` ist für alle dasselbe — es ist derselbe `useFetch`-Key.
  taktUmgebung ??= starteTakt(standNeu)

  onScopeDispose(() => {
    anmeldungen.value = anmeldungen.value.filter(a => a !== anmeldung)
    if (anmeldungen.value.length === 0) {
      taktUmgebung?.stop()
      taktUmgebung = undefined
    }
  })
}

function starteTakt(standNeu: () => Promise<void>) {
  const umgebung = effectScope(true)

  umgebung.run(() => {
    let timer: ReturnType<typeof setInterval> | undefined

    watch(
      () => taktIntervall(anmeldungen.value.map(a => a.wunsch.value)),
      (ms) => {
        clearInterval(timer)
        if (ms === null) return

        timer = setInterval(() => {
          standNeu()
          // Nur wer selbst gerade fragen will, zieht auch nach: Ein Wunsch von `null`
          // sieht bloß zu, während ein anderer den Takt hält.
          for (const a of anmeldungen.value) if (a.wunsch.value !== null) a.ziehtNach?.()
        }, ms)
      },
      { immediate: true },
    )

    onScopeDispose(() => clearInterval(timer))
  })

  return umgebung
}
