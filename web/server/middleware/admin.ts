import { isOperator } from '../utils/isOperator'

/**
 * Der Operator-Guard (ADR-0007, löst den GitHub-Guard aus ADR-0005 ab).
 *
 * Zwei Dinge haben sich gegenüber vorher geändert, und beide sind der Grund, warum
 * hier überhaupt gerechnet wird statt nur „Session vorhanden?" zu fragen: Eine Session
 * bekommt jetzt **jeder Athlet**, nicht mehr nur der Operator — „angemeldet" ist also
 * längst nicht mehr gleichbedeutend mit „Operator". Und die Rolle hängt an einer
 * Allowlist in der Umgebung, die sich ändern kann, während eine Session weiterläuft.
 *
 * Deshalb wird `isOperator` bei **jedem** Request neu über die Identität aus dem
 * `secure`-Teil der Session gerechnet. Das Feld `user.operator` wird hier bewusst nicht
 * gelesen: Es stammt zwar aus derselben versiegelten Session, ist aber ein
 * eingefrorenes Urteil und dient allein der Navigation.
 *
 * Geschützt sind die Fläche **und** ihre Endpunkte. `/api/admin/*` braucht denselben
 * Guard wie `/admin` — die Fläche ist nur die Anzeige, die Endpunkte sind der Zugriff.
 */
export default defineEventHandler(async (event) => {
  const istSeite = event.path === '/admin' || event.path.startsWith('/admin/')
  const istApi = event.path.startsWith('/api/admin/')
  if (!istSeite && !istApi) {
    return
  }

  const { user, secure } = await getUserSession(event)
  const erlaubt =
    !!user?.userId &&
    isOperator(secure?.provider, secure?.sub, useRuntimeConfig(event).operatorSubs)

  if (erlaubt) {
    return
  }

  if (istApi) {
    throw createError({ statusCode: 403, statusMessage: 'Kein Operator-Zugang' })
  }

  // Für die Fläche kein 403, sondern zurück auf die Startseite: Wer nicht angemeldet
  // ist, findet dort die Anmeldung; wer angemeldet, aber kein Operator ist, sein
  // Dashboard. Eine Fehlerseite wüsste in beiden Fällen weniger als die Startseite.
  return sendRedirect(event, '/', 302)
})
