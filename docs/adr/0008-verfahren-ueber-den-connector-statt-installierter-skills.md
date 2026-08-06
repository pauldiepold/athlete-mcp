# Das Verfahren kommt über den Connector, nicht über installierte Skills

Status: accepted (durch einen Spike auf `dev.training.pauldiepold.de` belegt, siehe unten)

Die Anleitungen, nach denen Claude mit den Daten eines Athleten arbeitet — **Wochensteuerung**, **Makroperiodisierung** und neu das **Onboarding** —, werden als **Tool-Antworten des MCP-Servers** ausgeliefert statt als Agent Skills, die jeder Athlet in sein Claude-Konto hochlädt. Ein Claude-**Plugin** wird nicht gebaut. Der Athlet installiert damit **nichts** außer dem Connector; die drei Verfahren stehen in dem Moment zur Verfügung, in dem der Connector steht.

## Warum nicht das Naheliegende

Der naheliegende Weg wäre ein Plugin: Es bündelt Skills *und* die Connector-Konfiguration, wird einmal installiert und ist der von Anthropic vorgesehene Verteilweg. Er scheitert an den Nutzern, für die dieses System gebaut ist. **Plugins gibt es nur auf bezahlten Plänen** („Plugins are available to all paid plans (Pro, Max, Team, Enterprise)"), und die Athleten hier sind Freunde auf dem kostenlosen Plan. Custom Connectors dagegen gibt es auf Free — allerdings **genau einen**, was in der Einrichtung erwähnt werden muss.

Bleiben hochgeladene Skills, die es auf Free tatsächlich gibt. Drei Einwände, in aufsteigender Schwere: Es sind pro Person mehrere manuelle Uploads am Ende eines Ablaufs, der bis dahin geführt war. Die jeweils aktuelle Fassung liegt danach in fremden Claude-Konten — eine Textänderung verlangt, dass jeder Athlet neu hochlädt, und bis der Letzte das tut, laufen verschiedene Fassungen gegen denselben Server. Und ob die claude.ai-Apps hochgeladene Skills überhaupt laden, ist nirgends dokumentiert; Skills setzen aktiviertes „Code execution and file creation" voraus, das auf Mobile als Feature bezahlter Pläne geführt wird. „Auch vom Handy" ist seit der CONTEXT-MAP eine tragende Eigenschaft dieses Systems und hinge damit an einer Unbekannten.

Über den Connector entfallen alle drei: kein Upload, ein Deploy erreicht alle, und was der Connector kann, kann er überall.

## Was der Spike beantwortet hat

Drei Fragen, alle auf `dev.training.pauldiepold.de` gegen claude.ai geprüft.

**Server-`instructions` kommen nicht an.** Das MCP-Protokoll kennt ein serverseitiges `instructions`-Feld, das der Client dem Modell dauerhaft vorlegt — im SDK ein Konstruktor-Argument. Ein Codewort darin, nach dem im Chat gefragt wurde, kam zweimal nicht zurück: claude.ai legt diesen Text dem Modell nicht vor. Damit gibt es **keine Always-on-Ebene**, über die man ein Verfahren unaufgefordert in den Kontext bekäme, und die Auslösung hängt vollständig an der `description` des Tools.

**Die Tool-`description` allein reicht.** Auf die natürliche Frage „Wie war meine letzte Trainingswoche?" hat Claude das Verfahrens-Tool in einem frischen Chat ungefragt aufgerufen — und die Datentools anschließend ungefähr in der Reihenfolge, die das zurückgegebene Verfahren vorgibt. Das ist der tragende Befund: Ein Tool kann die Rolle eines Skills übernehmen, wenn seine Beschreibung die Auslöser nennt, die vorher in der Skill-Frontmatter standen.

**Tool-Antworten sind ein unvertrauenswürdiger Kanal — und das ist eine Auflage an den Text.** Ein erster Verfahrenstext enthielt zu Testzwecken eine unterdrückende Anweisung ohne fachlichen Grund („nenne die Tools und rufe sie noch nicht auf"). Claude hat das als Prompt-Injection eingestuft und sich darüber hinweggesetzt. Mit einer fachlich normalen Fassung trat das nicht wieder auf. Die Lehre ist nicht „der Kanal trägt nicht", sondern: **Ein Verfahrenstext beschreibt eine Arbeitsweise, er unterdrückt keine Fähigkeiten.** Wer in einer Tool-Antwort Verbote formuliert, bekommt sie zu Recht ignoriert.

## Considered Options

- **Verfahren als Tools über den Connector** (gewählt) — nichts zu installieren, ein Ort für den Inhalt, funktioniert auf Free und auf jedem Gerät, und der Server weiß, *wer* fragt (siehe Consequences).
- **Plugin mit gebündelten Skills** — verworfen: für die Zielgruppe technisch nicht installierbar. Ohne gebündelte Skills bliebe ein Plugin, das nur eine URL einträgt; dafür lohnt kein zweiter Verteilweg.
- **Skills als Zip zum Hochladen** — verworfen als Regelweg, siehe oben. Bleibt als Rückfall verfügbar.
- **Beides parallel, „mit gleichem Inhalt"** — verworfen: *gleicher Inhalt* ist dann eine Zusage, die jemand einhalten muss, und die Free-Fassung ist die, die veraltet, weil ihr Update durch fremde Hände läuft.
- **Auf die Server-`instructions` bauen** — vom Spike widerlegt, bevor daraus ein Entwurf wurde.

## Consequences

- **Drei Tools, nicht eines mit Parameter.** Die `description` ist im Connector-Modell das, was die `description` eines Skills war: der einzige Text, an dem das Modell erkennt, *wann* es zugreifen soll. Die bestehenden Skill-Beschreibungen trennen „Was steht heute an?" von „Bin ich auf Kurs für mein Ziel?" bereits sorgfältig; in einem gemeinsamen Tool müsste diese Trennschärfe in eine Beschreibung gepresst und zusätzlich als Parameterwahl gelernt werden.
- **Die Verfahrenstexte sind Teil des Deployables.** Sie liegen als Markdown in `src/steuerung/verfahren/` — diffbar, reviewbar, ohne Escaping — und werden beim Build hereingezogen. Preis: Jede Textänderung ist ein Deploy. Gemessen an „jeder Athlet lädt neu hoch" ist das der günstigere Preis, aber es ist einer.
- **Das Verfahren kann pro Athlet variieren — und genau da liegt eine Grenze.** Weil der Server den Aufrufer kennt, kann er ein anderes Verfahren ausgeben, je nachdem ob ein Coach-Plan über Final Surge existiert oder jemand selbstgesteuert trainiert, ob Garmin verbunden ist, ob schon ein Steuerungsplan existiert. Erlaubt ist Variation, die aus dem **Zustand** folgt. **Nicht** erlaubt ist, Athleten-Fakten in den Verfahrenstext einzusetzen: Der Grundsatz „Verfahren gehört ins Verfahren, Fakten gehören in den Steuerungs-Store" bleibt unangetastet, sonst entsteht ein zweiter Ort für Athleten-Fakten neben dem, der genau dafür gebaut wurde.
- **Beiläufige Erwähnungen sind der Preis.** Ein Skill wird geladen, weil seine Beschreibung zum Gesprächsverlauf passt; ein Tool wird aufgerufen, weil das Modell beschließt, es zu brauchen. Bei „Wie war meine Woche?" ist das nachweislich gleichwertig. Bei „puh, die 20 km heute waren zäh" ist es ungeprüft, und die bisherige Skill-Beschreibung verspricht ausdrücklich, auch dort auszulösen. Bewusst akzeptiert, weil der **Rückfall billig ist**: ein fünfzeiliger Skill-Stub („Für die Wochensteuerung `get_verfahren_woche` aufrufen und ihm folgen"), der sich nie wieder ändert und den Inhalt weiterhin serverseitig lässt. Er wird erst gebaut, wenn sich im Alltag zeigt, dass Erwähnungen durchrutschen — nachrüsten kostet ein Zip, vorbauen kostet drei Athleten, die schon hochgeladen haben.
- **`.claude/skills/` entfällt.** Die beiden Verfahren lagen dort, weil es der Ort war, an dem Claude Code sie fand. Ein Verzeichnis dieses Namens, das Texte enthält, die nie ein Skill sind, wäre irreführend.
- **Das Onboarding ist erst dadurch möglich.** Ein Onboarding-Verfahren, das man vorher installieren muss, hat einen Schritt vor dem ersten Schritt. Über den Connector steht es zur Verfügung, sobald der Connector steht — und ist damit der Übergabepunkt zwischen dem technischen Teil in der Weboberfläche und dem inhaltlichen Teil im Chat.
- **„Onboarded" wird abgeleitet, nicht gemeldet.** Das Onboarding-Verfahren schreibt am Ende den Steuerungsplan; sein Vorhandensein *ist* das Fertig-Signal. Dieselbe Linie, nach der auch *verbunden* aus dem Vorhandensein der KV-Einträge abgeleitet wird (Issue #44) — ein Flag daneben wäre ein zweiter Wahrheitsort mit demselben Zweck und falsch, sobald jemand seinen Plan löscht.
