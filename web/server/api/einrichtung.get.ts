import { SteuerungStore } from '@shared/steuerung/steuerungStore'

/**
 * Was die Einrichtung (Issue #52) über die beiden Schritte weiß, die nicht aus den
 * Verbindungen kommen — plus die MCP-URL, die der Athlet kopiert.
 *
 * Die Verbindungen stehen bewusst **nicht** mit drin: Sie kommen aus
 * `/api/verbindungen`, dem einen Endpunkt, den sich Einstellungen und
 * Dashboard-Hinweis teilen (Issue #44). Sie hier zu wiederholen, hieße zwei Quellen
 * für denselben Zustand — und genau die widersprechen sich in dem Moment, in dem
 * jemand gerade verbunden hat und hinschaut.
 *
 * Beides ist **abgeleitet**: der Connector aus den Grants, das Onboarding aus dem
 * vorhandenen Steuerungsplan. Es gibt kein Flag, das der Athlet quittiert.
 *
 * Die MCP-URL kommt aus der Origin dieses Requests, nicht aus Konfiguration: Seit
 * ADR-0007 liegen Weboberfläche und `/mcp` auf derselben Origin, und dev und prod
 * sollen sich nicht in einer Umgebungsvariablen unterscheiden, die man vergessen kann.
 */
export default defineEventHandler(async (event) => {
  const { userId, env } = await resolveAthlet(event)
  const store = new SteuerungStore(env.ATHLETE_DB)

  const [connector, plan] = await Promise.all([
    hatConnector(event, userId),
    store.getPlan(userId),
  ])

  return {
    connector,
    steuerungsplan: plan.trim().length > 0,
    mcpUrl: `${requestOrigin(event)}/mcp`,
  }
})
