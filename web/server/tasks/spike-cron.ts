/**
 * SPIKE #37 — Checkpoint 2, Frage 3: überlebt der Cron den Wrapper?
 * Stellvertreter für den echten Körperdaten-Cron. Schreibt nur einen Log-Eintrag.
 */
export default defineTask({
  meta: {
    name: 'spike:cron',
    description: 'Spike-Platzhalter für den Körperdaten-Cron',
  },
  run() {
    console.log('[spike] Nitro-Task spike:cron gelaufen', new Date().toISOString())
    return { result: 'ok' }
  },
})
