// Operator-Erkennung (ADR-0007, löst die GitHub-Allowlist aus ADR-0005 ab): **ein
// Login, zwei Rollen** — der Operator meldet sich mit demselben Konto an wie als
// Athlet, eine Allowlist schaltet zusätzlich /admin frei.
//
// Erkannt wird an der **Identität**, nicht am Konto: ein Google-`sub` aus der
// Umgebungsvariable `NUXT_OPERATOR_SUBS` (kommagetrennt). Nicht hartkodiert wie der
// GitHub-Login vorher, weil ein `sub` im Gegensatz zu einem Login-Namen nicht
// selbsterklärend ist und sich zwischen den Umgebungen unterscheidet.
//
// **Nur Google.** Die Admin-Fläche ist das stärkste Gate im System und darf nicht am
// fremden Apple-Developer-Konto hängen (dessen `sub` ist zudem team-gebunden — ein
// Team-Wechsel erzeugt neue Identifier für alle Nutzer).
//
// Eine leere oder fehlende Liste heißt **kein** Operator, nicht *alle*. Der Weg zum
// ersten Operator ist entsprechend: einmal anmelden, den eigenen `sub` ablesen, die
// Variable setzen.

/** Zerlegt die kommagetrennte Env-Variable in `sub`-Werte; Leeres fällt weg. */
export function parseOperatorSubs(roh: string | null | undefined): string[] {
  return (roh ?? '')
    .split(',')
    .map((eintrag) => eintrag.trim())
    .filter((eintrag) => eintrag.length > 0)
}

/**
 * Reiner Guard: Darf diese Identität die Operator-Fläche sehen? `subs` ist die rohe
 * Env-Variable, so wie sie in der Konfiguration steht.
 *
 * Case-**sensitiv**, anders als der abgelöste GitHub-Login: ein `sub` ist eine opake
 * Kennung, kein Name — Groß-/Kleinschreibung zu ignorieren würde die Menge der
 * akzeptierten Werte grundlos vergrößern.
 */
export function isOperator(
  provider: string | null | undefined,
  sub: string | null | undefined,
  subs: string | null | undefined,
): boolean {
  if (provider !== 'google') {
    return false
  }

  const kandidat = sub?.trim()
  if (!kandidat) {
    return false
  }

  return parseOperatorSubs(subs).includes(kandidat)
}
