import type { H3Event } from 'h3'

/**
 * Die Cloudflare-Bindings dieses Requests — die eine Stelle, an der der Cast steht.
 * `event.context` ist untypisiert; vorher stand derselbe Ausdruck in jeder Route neu,
 * und jede neue Route hat ihn abgeschrieben.
 */
export function envOf(event: H3Event): Env {
  const kontext = event.context as { cloudflare: { env: unknown } }
  return kontext.cloudflare.env as Env
}
