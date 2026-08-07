/**
 * Etwas in die Zwischenablage legen und für zwei Sekunden „Kopiert" sagen (Issue #52).
 *
 * Zwei Schritte der Einrichtung leben davon — die persönliche Adresse und der Startsatz —,
 * und beide brauchen dieselbe Rückmeldung: Ohne sie drückt der Athlet ein zweites Mal,
 * weil ein Klick, der nichts sichtbar tut, wie ein Fehlklick aussieht.
 *
 * `navigator.clipboard` fehlt in unsicheren Kontexten und älteren Browsern. Dann
 * bleibt es einfach beim Fehlschlag — beide Texte stehen im Klartext daneben und sind
 * markierbar; genau deshalb sind sie keine Tooltips.
 */
export function useKopieren(text: MaybeRefOrGetter<string>) {
  const kopiert = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(toValue(text))
      kopiert.value = true
      clearTimeout(timer)
      timer = setTimeout(() => (kopiert.value = false), 2000)
    } catch {
      kopiert.value = false
    }
  }

  onBeforeUnmount(() => clearTimeout(timer))

  return { kopiert, kopieren }
}
