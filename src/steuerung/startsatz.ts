import { PRODUKTNAME } from '../produkt'

/**
 * Der Satz, mit dem ein Athlet mit leerem Store sein Trainingsbuch anlegen lässt
 * (Issue #50, umbenannt in #59).
 *
 * Er steht an **einer** Stelle, weil ihn zwei Seiten brauchen: Die Einrichtung im
 * Browser bietet ihn zum Kopieren an, und die `description` von
 * `get_playbook_onboarding` nennt ihn wörtlich als ihren Auslöser. Driften die
 * beiden auseinander, tippt der Athlet einen Satz, auf den nichts mehr zielt — und
 * merkt es nicht, weil Claude trotzdem irgendetwas antwortet.
 *
 * Dass es überhaupt einen *vorgegebenen* Satz gibt, ist der Preis für einen engen
 * Auslöser: Ein Einstieg, der bei jedem „Hallo" anspringt, fragte nach dem
 * Zielrennen, wenn jemand nur wissen wollte, was heute ansteht — für alle, die längst
 * einen Plan haben, eine Plage. Der enge Auslöser braucht dafür eine Stelle, an der
 * der Athlet ihn lesen kann; das ist die Einrichtung.
 *
 * Er trägt seit Issue #59 den **Produktnamen**: Damit heißt der Auslöser wie das
 * Produkt, und der Athlet muss sich ein Wort weniger merken.
 */
export const STARTSATZ =
  `Ich bin neu hier — schalt bitte in den ${PRODUKTNAME} und leg mein Trainingsbuch an.`
