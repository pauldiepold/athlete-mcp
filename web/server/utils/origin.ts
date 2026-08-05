import type { H3Event } from 'h3'

/**
 * Die Origin dieses Requests (`https://host`, ohne Schrägstrich am Ende).
 *
 * Seit ADR-0007 liegen MCP-Endpunkt und Browser-Fläche im selben Deployable, also
 * werden die an Athlet und Operator ausgegebenen Links aus dem Request abgeleitet
 * statt konfiguriert (`WEB_BASE_URL` ist entfallen). Das macht die Herkunft dieser
 * Links sicherheitsrelevant: Der Dashboard-Link trägt das View-Secret und **ist**
 * die Anmeldung.
 *
 * Deshalb bevorzugt: die URL des echten Cloudflare-Requests. Sie ist die einzige
 * autoritative Quelle. Der sonst übliche Weg über `getRequestURL` rät das Schema aus
 * dem `x-forwarded-proto`-Header und fällt ohne ihn auf `http` zurück — ein Link, den
 * der Athlet anklickt, darf aber nicht von einem Header abhängen.
 *
 * Fallback ist `getRequestURL` für Umgebungen ohne echtes Cloudflare-Request-Objekt,
 * allen voran das lokale `nuxt dev` über getPlatformProxy.
 */
export function requestOrigin(event: H3Event): string {
  const cfRequest = (event.context.cloudflare as { request?: Request } | undefined)?.request
  if (cfRequest?.url) {
    return new URL(cfRequest.url).origin
  }

  return getRequestURL(event).origin
}
