# Admin-/Operator-Surface mit GitHub-OAuth (nuxt-auth-utils)

Status: superseded by [ADR-0007](./0007-oauth-identitaet-statt-url-secrets-ein-deployable.md) — **von diesem ADR ist nichts mehr in Kraft.**

Es überlebt der **Operator-Begriff**, den es eingeführt hat (Betreiber vs. Athlet), und die Admin-Fläche selbst. Alles andere ist gefallen, und zwar an der Wurzel:

- **GitHub-OAuth ist raus.** Operator und Athlet melden sich über **dieselbe** Anmeldung an (Google oder Apple); `/admin` schaltet eine Allowlist von Google-`sub` frei (`NUXT_OPERATOR_SUBS`), keine zweite Session. Die hier begründete Trennung „GitHub-Session vs. URL-Secret" hatte nur Sinn, solange es das URL-Secret gab.
- **Der Gegenstand der Seite hat sich gedreht.** Sie listet keine Secrets mehr, sondern **Konten, Identitäten und offene Invite-Codes** — und ist damit nicht mehr das „stärkste Gate im System"; die Begründung dafür (sie aggregiere alle Schreib-`pathsecret`s) ist gegenstandslos. Die Vorsichtsmaßnahme „MCP-URL nur hinter explizitem Anzeigen" ebenso: Es gibt keine per-Athleten-MCP-URL mehr.
- **Nicht mehr read-only.** Die Seite **stellt Invite-Codes aus** — die einzige Mutation, die es braucht, seit Provisionierung Self-Service ist.
- **Kein Onboarding-CLI mehr**, in das Re-Seed und Deboard ausgelagert wären; es liegt seit Issue #46 in `archive/`.

Der historische Text folgt unverändert.

Das Nuxt-Frontend bekommt eine `/admin`-Route, die den **ersten Betreiber-/Operator-Begriff** im System einführt (vs. Mandant). Sie listet die onboardeten Nutzer und deren Links (View-URL + MCP-URL), indem sie KV rückwärts auflöst (`userId → pathsecret/viewsecret`, wie `findExistingSecret` in `scripts/onboard.ts`). Authentifizierung über **`nuxt-auth-utils` + GitHub-OAuth**, allowlistet auf die GitHub-Identität des Betreibers — sealed-cookie-Session, **kein Secret in der URL**, kein geteiltes statisches Token. Erster Cut **read-only**: keine Mutationen in der UI (Re-Seed/Rotate/Deboard bleiben im Onboarding-CLI).

## Considered Options

- **GitHub-OAuth via nuxt-auth-utils** (gewählt) — idiomatisch im Nuxt-Stack, echte Identität, null externe Config, allowlistbar auf eine Person.
- **Cloudflare Access vor `/admin`** — gleichwertig stark, aber Plattform-Config statt In-App.
- **Statisches `ADMIN_TOKEN` (Basic/Bearer)** — verworfen: geteiltes statisches Secret, Rotation = Redeploy, kein echtes Identitätslog.
- **Admin-URL-Secret (`adminsecret:`, wie path/view)** — verworfen: genau das ADR-0003-Antipattern. Diese eine Seite versammelt **alle** Schreib-`pathsecret`s; ein leak-/screenshot-bares URL-Secret hier wäre der schlimmste Single Point of Failure.

## Consequences

- **Stärkstes Gate im System.** Weil die Seite alle vollen MCP-Schreib-Secrets aggregiert, muss ihre Auth bewusst stärker sein als die ratebaren Mandanten-URL-Secrets — das adressiert direkt die Blast-Radius-Begründung aus ADR-0003.
- **Darstellung mit Vorsicht.** View-URL frei sichtbar (nur Lesen), die **MCP-Schreib-URL hinter explizitem Anzeigen/Kopieren** statt Default-Klartext → kein versehentlicher Screenshot des hochwertigsten Secrets.
- **Neue Env-Secrets** im Nuxt-Worker: Session-Secret + GitHub-OAuth-App-Credentials.
- **Kein Worker-Eingriff.** Die Seite liest KV über das Nuxt-Binding; der MCP-Worker bleibt unberührt. Mutationen bewusst ausgespart (YAGNI), das CLI bleibt der einzige Schreibpfad fürs Provisioning.
