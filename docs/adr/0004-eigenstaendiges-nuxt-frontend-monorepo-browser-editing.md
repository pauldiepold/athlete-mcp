# Eigenständiges Nuxt-Frontend (Monorepo) mit Browser-Editing der Steuerung

Status: accepted — supersedet in Teilen [ADR-0003](./0003-read-only-browser-ansicht-zweite-surface.md)

Wir bauen ein **eigenständiges Nuxt-Frontend** als **zweites Deploy-Target im selben Repo** (Monorepo), das die bestehende D1/KV bindet und `SteuerungStore`, `TenantResolver` und `migrations/` **direkt importiert** (Single Source of Truth fürs Schema). Es bringt **Browser-Editing** von Steuerungsplan + Wochen: ein Markdown-Quelltext-Editor (kein WYSIWYG im ersten Cut) mit `marked`-Live-Preview — **Markdown bleibt das kanonische Speicherformat**, exakt das, was der Agent über MCP liest/schreibt. Damit kehren wir die in ADR-0003 verworfene Option „separates Frontend" bewusst um: Editing braucht ohnehin Client-JS, und ein **server-seitiges** Nuxt (SSR) entkräftet die beiden Haupt-Einwände von ADR-0003 (CORS und Secret im Browser-Bundle entfallen, weil der Nuxt-Server das View-Secret auflöst und die Bindings nie im Bundle landen).

Aus Nutzersicht bleibt alles wie bisher: derselbe per-User-Link mit dem bestehenden **View-Secret** authentifiziert ihn — nur kann er seine eigene Steuerung jetzt **lesen und editieren** (kein OAuth für normale Nutzer). Die Operator-Auth (ADR-0005) gilt nur für die Admin-Ansicht.

## Considered Options

- **Monorepo, zwei Deploy-Targets, geteilte TS-Module** (gewählt) — MCP-Worker bleibt unangetastet (eigener Entrypoint mit Durable Object + Cron), Nuxt ist ein zweiter Entrypoint. Schema/Invariante/KV-Keys existieren genau einmal, typgeprüft → keine Drift.
- **Separates Repo, Nuxt re-implementiert Store/Auth/Schema** — verworfen: Schema + KV-Konventionen würden ein untypisierter Cross-Repo-Vertrag → stille Drift bei Migrationen.
- **Alles in Nuxt (ein Deployable, inkl. MCP-Endpunkt)** — als *Endzustand* das sauberste (kein Sharing-Problem), aber jetzt eine Migration des arbeitenden DO-/MCP-/Cron-Codes in Nitro ohne funktionalen Gewinn. Als spätere, bewusste Konsolidierung offengehalten, nicht Teil des ersten Cut.
- **Nuxt ruft eine Worker-Schreib-API** (Frontend fasst D1 nicht an) — verworfen: fügt dem Worker eine HTTP-API hinzu (was ADR-0003 vermeiden wollte) und lässt zwei Deployables mit Netz-Hop bestehen.

## Consequences

- **Single-Writer-Invariante aufgelöst.** ADR-0002/ADR-0003 postulierten „nur der Agent schreibt". Mit Browser-Editing schreiben **Mensch und Agent** dasselbe Objekt. Bewusst **Last-Write-Wins**, keine Schutzlogik: ein Mensch je Plan/Wochen, gleichzeitiges Chat- + Browser-Editieren ist unwahrscheinlich, im Zweifel gehen wenige Infos verloren. Eine billige DB-Versionierung (History/Restore im Frontend) ist als spätere Option vorgemerkt, nicht im ersten Cut.
- **Zweites Deploy-Target + Build-Pipeline werden jetzt akzeptiert** — der bewusste Verzicht aus ADR-0003 gilt nicht mehr.
- **View-Secret nicht mehr read-only.** Das `viewsecret` gewährt im Frontend jetzt read+edit der *eigenen* Steuerung; ein Leak gibt also auch Schreibzugriff — aber nur auf eine Nutzer-Steuerung, nicht den vollen MCP-Schreibzugriff des `pathsecret`. Die Path/View-Trennung behält ihren Wert, nur das Adjektiv „read-only" fällt. Der KV-Key bleibt `viewsecret:` (keine Re-Seed-Migration).
- **Neue Kopplungsgrenze.** Ein zweites Deployable teilt das D1-Schema und die KV-Konventionen. Risiko der Drift wird durch **geteilte TS-Module im Monorepo** (Compiler statt Konvention) eingefangen, nicht durch einen Cross-Repo-Vertrag.
- **Editor ist austauschbar.** Weil das Speicherformat Markdown bleibt, ist ein späteres TipTap-WYSIWYG ein reiner Frontend-Tausch ohne Store- oder Agent-Contract-Änderung. Falls TipTap kommt, gilt ein Vertrag: das Agent-Markdown bleibt im GFM-Subset, den der Editor verlustfrei round-trippt.
- Die read-only Ansicht aus ADR-0003 selbst **bleibt gültig** und darf simpel bleiben.
