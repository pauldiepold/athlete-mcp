import { listInvites, listKonten } from '@shared/identitaet'

/**
 * Die Operator-Sicht auf Identität (ADR-0007): die Konten, die eine Identität haben,
 * und die Codes, die noch offen sind.
 *
 * Was hier **nicht** mehr steht: Zugangsschlüssel. Vorher listete diese Fläche pro
 * Nutzer das MCP-Pfad-Secret und das View-Secret — ein Screenshot davon war die
 * Übernahme aller Konten. Jetzt ist das Wertvollste ein offener Invite-Code, und der
 * ist einmalig, kontogebunden und nach 14 Tagen tot.
 *
 * Offene Codes stehen bewusst im Klartext: Der Operator muss sie weitergeben können,
 * und ein Code, den niemand lesen kann, ist keiner.
 *
 * Eigener Guard braucht es hier nicht — server/middleware/admin.ts deckt `/api/admin/*`
 * mit ab und rechnet die Operator-Rolle pro Request neu.
 */
export default defineEventHandler(async (event) => {
  const kv = envOf(event).SESSION_KV

  const [konten, invites] = await Promise.all([listKonten(kv), listInvites(kv)])
  return { konten, invites }
})
