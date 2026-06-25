---
name: lauf-wochensteuerung
description: Taktische Wochen- und Tagessteuerung fürs Lauftraining eines Athleten Richtung Zielrennen. Nutze diesen Skill immer, wenn der Athlet nach seinem aktuellen Training fragt – z. B. "Was steht heute/diese Woche an?", "Wie war mein letzter Lauf?", "Soll ich das geplante Workout so machen?", "Passt die Einheit für mich?", nach einer Auswertung der letzten Tage, nach einem Soll/Ist-Vergleich (geplant vs. gelaufen), oder nach Vorschlägen fürs Kraft-/Stabitraining. Auch für das wöchentliche Sonntagabend-Ritual (Rückblick + Entwurf der kommenden Woche) und das Erst-Onboarding bei leerem Store. Auch auslösen, wenn der Athlet nur beiläufig über seine Woche, eine konkrete Einheit oder seine aktuelle Belastung spricht. Für die langfristige Periodisierung Richtung Zielrennen stattdessen den Skill lauf-makroperiodisierung verwenden.
---

# Lauf-Wochensteuerung

Taktische Steuerung der Trainingswoche eines Läufers Richtung Zielrennen — in der Lücke zwischen einem (optionalen) Coach-/Team-Rahmenplan und dem eigenen Renn-Ziel.

## Grundprinzip & Arbeitsteilung

- **Skill = Verfahren, Store = Fakten.** Alles Athleten-Spezifische (Ziel, Form, Paces, Phase, Block, Baseline, Coach-Setup, Einheiten) steht **ausschließlich im Steuerungs-Store**, nie im Skill hartkodiert — sonst veraltet er, wenn sich die Form ändert.
- **Dieser Skill besitzt die Wochen-Keys.** Er darf die **Zahlen** im Form-Snapshot des Steuerungsplans nachziehen (neue Anker-Pace nach einem Schlüsselrennen + Änderungslog-Zeile), baut aber **Block/Phase/Strategie nicht um** — das ist Sache von `lauf-makroperiodisierung`.
- Der Store hängt am Athlete-MCP (eigene URL pro Nutzer). Mehrere Tools sind deferred → zuerst per `tool_search` laden, dann mit exakten Parameternamen aufrufen.

## Onboarding (leerer Store)

**Immer zuerst prüfen:** `get_steuerungsplan()` und `list_wochen()`. Sind **beide leer** (`""` / `[]`) → Neu-Nutzer: erst onboarden, dann normal weiter. Kurzes Interview (eine Frage-Runde), dann via `set_steuerungsplan` einen **schlanken Starter-Plan** schreiben (Struktur s. „Aufbau des Steuerungsplans"):

1. **Zielrennen:** Rennen, Datum, Distanz?
2. **Ziel:** Zielzeit oder Ziel-Pace?
3. **Coach/Team-Plan:** vorhanden (z. B. Final Surge)? Wenn ja: Quelle/Tool. Wenn nein: selbstgesteuert.
4. **Form:** jüngstes Rennen/Benchmark, geschätzte VDOT/Schwellen-Pace, typischer Wochenumfang.
5. **Körperdaten:** Garmin verbunden? Wenn ja, Erholungs-Baseline aus `get_koerperdaten_range` (erste 2–3 Wochen) ableiten oder über die kommenden Wochen kalibrieren.
6. **Phase/Horizont:** Basis vs. spezifischer Block, wie viele Wochen bis zum Rennen?

Tiefe kommt später über das Wochenritual und Strategie-Chats. Optional die laufende Woche schon als ersten Wochen-Key anlegen.

## Datenquellen

Alle Daten über **MCP-Tools** (keine lokalen Dateien). Typischer Ablauf: erst Steuerungsplan + letzte Woche(n), dann Coach-Plan (7 Tage) + Ist-Läufe (14 Tage) + Körperdaten, dann antworten.

**Steuerungs-Store (athlete-mcp):**
- `get_steuerungsplan()` → **Single Source of Truth.** Immer zuerst lesen. Trägt oben einen **Konfig-Block** (Coach ja/nein + Quelle, Zielrennen) — dem folgen.
- `list_wochen()` + `get_woche(kw)` → letzte 1–2 Wochen für Kontinuität (Soll/Ist **und** subjektives Feedback — das steht nicht in den Aktivitätsdaten).
- Schreiben: `set_woche(kw, content)` und `set_steuerungsplan(content)` — beides **Whole-Object** (ganzes Objekt neu, nie Append/Marker/Prepend). Store ist Single-Writer (nur der Agent).
- **Wochen-Key-Konvention:** Ein Key `YYYY-Www` ist die **komplette Akte der Woche** — (B) Entwurf, geschrieben am Sonntag davor, **+** (A) Rückblick, geschrieben am Sonntag des Wochenendes, plus subjektive Notizen. Die Vorschau einer Woche lebt im Key DIESER Woche.

**Coach-Plan (Final Surge, falls vorhanden — deferred):** `get_upcoming_workouts` (nächste 7 Tage) bzw. `get_planned_workouts` (expliziter Zeitraum). ⚠️ Kann Einträge **anderer Athleten** enthalten → geplantes Rennen ≠ vom Athleten gelaufenes Rennen, immer bestätigen.

**Ist-Läufe (Strava — deferred):** `list_activities` (Rückblick 14 Tage), Schlüsseleinheiten via `get_activity_performance`/`get_activity_streams`, HF-Zonen via `get_athlete_zones`. ⚠️ Liefert meist **nur Titel + Metriken, nicht die private Notiz** — Subjektives kommt aus dem Wochen-Key oder vom Athleten.

**Körperdaten (Garmin, athlete-mcp):** `get_koerperdaten(date)` / `get_koerperdaten_range(start, end)`. Siehe Erholungs-Overlay.

## Rollenklärung

**Mit Coach:** Dieser Skill ist **kein zweiter Coach**. Coach-Einheiten lesen, gegen das Renn-Ziel interpretieren, Umsetzung bewerten, Soll/Ist vergleichen — und **nur dort** eigene Einheiten vorschlagen, wo der Coach-Plan fürs Ziel wenig passt. Das Picking bleibt **kohärent aufs Zielrennen** ausgerichtet, kein zusammengewürfeltes Drittes. **Selbstgesteuert (kein Coach):** direkt planen, aber an der im Steuerungsplan hinterlegten Strategie/Phase ausgerichtet.

## Pace-/Einheiten-Konvention (hart, immer)

Pace **immer in min/km** (Format `M:SS/km`). **Niemals m/s oder km/h** – in keiner Tabelle, Zwischenrechnung, keinem Nebensatz. Aktivitäts-Connectoren liefern oft m/s: umrechnen mit `min/km = 60 / (m_pro_s × 3,6)`, Ergebnis als `M:SS`. Distanzen in km (Meter ÷ 1000), Höhe in m.

## Wochentabelle: km pro Tag + Wochensumme (hart, immer)

Jede Tages-Tabelle einer Woche (Verlauf bzw. Entwurf B) trägt **rechts eine km-Spalte** und **unten eine Summenzeile** mit den Wochenkilometern. Gilt für KW-Rückblick, Entwurf der Folgewoche und jede ad-hoc gezeigte Wochentabelle.

- **Pro Tag:**
  - **Durchgeführter Tag** → **Ist** aus Strava (`list_activities` über den Wochen-Bereich Mo 00:00 – So 23:59). Wert = **Tagessumme aller Läufe** des Tages (Ein-/Auslaufen + Hauptteil + separat geloggte wu/cd zusammenzählen), Meter ÷ 1000, eine Nachkommastelle (`8,0`). Alltagsradfahren/Cross **nicht** in die Lauf-km zählen (separate aerobe Last, s. Steuerungsplan).
  - **Geplanter/künftiger Tag** → **Schätzung** aus der geplanten Einheit, als `~15 (Plan)` markiert. Zeit-Vorgaben über die Easy-/Ziel-Pace in km umrechnen (z. B. 80' easy @ ~4:50 ≈ 16 km), Workout-Tage inkl. wu/cd.
- **Summenzeile** (`**Σ Woche**`): solange die Woche läuft, **Ist + Plan getrennt** ausweisen (`Ist 17,8 + Plan ~62 ≈ ~80`). Ist die Woche abgeschlossen, **reines Ist** (`Σ 96`).
- **Beim Sonntagsritual:** alle Plan-Schätzungen der abgelaufenen Woche durch Strava-Ist ersetzen, Summe auf reines Ist umstellen. Dann im Entwurf der Folgewoche die Plan-km neu setzen.
- **Format-Beispiel:**

  | Tag | Einheit | km |
  |---|---|---|
  | Mo 22.06 | easy | 0,4 |
  | Di 23.06 | Primer 8 km + 6×200 | 8,0 |
  | … | … | … |
  | **Σ Woche** | | **Ist 17,8 + Plan ~62 ≈ ~80** |

- **Realismus-Watch:** Easy-/LR-Schätzungen liegen beim „Bisschen-mehr"-Reflex chronisch **unter** dem Ist — Schätzung nicht künstlich hochziehen, aber beim Soll/Ist die systematische Überschreitung benennen, wenn sie ein Disziplin-/Erholungsthema wird (s. „Aktiv flaggen").

## Form-Referenz

Die Form steht im **Steuerungsplan** (Form-Snapshot mit Stand-Datum: Ziel, Fitness-Kennzahl/VDOT, jüngste Schlüsselrennen, Anker-Paces). Diesen Snapshot als Basis nehmen. **Pace-Zonen nie statisch speichern** – immer aus der aktuellen Fitness-Kennzahl ableiten, sonst sind sie im Block nach wenigen Wochen falsch. Die Anker-Paces (MP, Schwelle, VO2/5K-Ziel) sind Orientierung, kein Ersatz für die Ableitung. Verschiebt ein neues Schlüsselrennen die Form: die **Snapshot-Zahlen via `set_steuerungsplan` nachziehen** (Plan komplett neu bauen, Änderungslog-Zeile + Datum) — Block/Strategie aber dem Makro-Skill überlassen.

## Haltung je nach Phase

Stärke der Einmischung hängt von der **im Steuerungsplan deklarierten Phase** ab (heutiges Datum gegen den Plan prüfen):
- **Basis-/entspannte Phase:** konservativ. Coach-Plan folgen, Team-Kohäsion/Spaß respektieren. Nur eingreifen, wenn eine Einheit **klar kontraproduktiv** wäre. Im Zweifel mitmachen.
- **Spezifischer Block (rennnah):** ziel-kompromisslos. Einheiten, die dem Ziel nicht dienen, klar benennen und einen **kohärenten Ersatz** vorschlagen, der in die Block-Logik passt.

Am realen Coach-Plan und Block prüfen, kein Modell über die Realität legen.

## Eigene Vorschläge

- **Lauf-Einheiten:** nur, wenn der Coach-Workout fürs Ziel wenig passt (s. Phasen-Haltung). Sonst interpretieren und bei der Umsetzung helfen (Pacing, Struktur, Renncharakter).
- **Kraft/Stabi: aktiv, aber schlank** (Rumpf, Klimmzüge/Hängen, je nach Setup). Supplementär beim Marathon, kein Selbstzweck. Konkret werden auf Nachfrage.

## Soll/Ist-Vergleich & Steuerung

**Nach Schlüsseleinheiten und Longruns standardmäßig kurz vergleichen** (planen vs. gelaufen), nicht erst auf Nachfrage — das ist der Kern der Wochensteuerung. **Ausführlich** (volle Struktur, alle Splits) auf Nachfrage. Nach reinen Easy-Läufen nur, wenn etwas auffällt. Geplanten Workout (Coach-Plan bzw. Entwurf im Wochen-Key) gegen die gelaufene Aktivität halten — Struktur, Pace-Targets vs. real, HF, Renncharakter. Ehrlich bewerten (getroffen/übertroffen/verfehlt/anders). Ergebnis via `set_woche` in den Key. **km-Spalte + Wochensumme dabei stets mitführen** (Plan → Ist umstellen, Σ aktualisieren; s. „Wochentabelle"). Bei Schlüsseleinheiten Pace und – wo vorhanden – HF/Laktat **zusammen** lesen, nicht Pace isoliert (wie der Athlet steuert, steht im Steuerungsplan). **Multisport** (Rad/Schwimmen/Wandern) ist aerobe Cross-Last, **kein Lauf-Defizit** — als Gesamtbelastung einordnen, nicht gegen das Lauf-Soll rechnen und **nicht** in die Lauf-Wochen-km zählen.

## Körperdaten-Erholungs-Overlay

Körperdaten als **Belastungs-/Regenerations-Schicht** über die Lauf-Daten legen — sie erklären, warum eine Einheit gut/schlecht lief und ob Erholung der Limiter ist. `get_koerperdaten_range` über die betrachtete Woche ziehen.

**Relative Bewegungen gegen die im Steuerungsplan hinterlegte Erholungs-Baseline lesen, nicht absolute Scores.**
- **Ruhepuls (RHR):** verlässlichstes Signal, Wochentrend gegen die Baseline.
- **HRV:** **Wochenmittel** gegen die Baseline-Spanne, nicht Einzelnächte (volatil).
- **Schlaf:** Phasen, Dauer, `resting_heart_rate`. Kurznächte crashen die Folgetag-Marker.
- **Stress** (avg/max), **Hauttemp** (`deviation_celsius`), **Body Battery** (`charged`/`drained`, kein verlässlicher Absolutstand).

**Training Readiness** (aggregierter Score): als **nachrangiger Korroborations-Indikator** lesen, nicht als Primär-Call. Deckt er sich mit den Roh-Markern → bestätigend (das tut er in der Praxis oft). **Widerspricht er, schlagen Roh-Marker + Trainingskontext den Aggregat** — ein niedriger Score kippt keine geplante harte Einheit, wenn RHR/HRV/Schlaf sauber sind. Hintergrund: konservativ verzerrt für Ausdauerathleten (bestraft niedrige absolute HRV und geplante Block-Last), und als Aggregat versteckt er, *welcher* Marker sich bewegt hat.

**Warnsignal-Cluster (proaktiv flaggen):** RHR hoch **+** HRV am Floor **+** Stress hoch **+** Hauttemp deutlich positiv (>~1 °C) = beginnende Überlastung oder Infekt → Training rausnehmen/reduzieren. Einzelne Marker schwanken; erst das Cluster ist das Signal.

## Aktiv flaggen

Wenn die Daten danach aussehen, **proaktiv** ansprechen (auch ungefragt): HF bei gewohnter Pace deutlich erhöht, plötzlicher Umfangssprung, häufende „Easy"-Läufe die nicht easy aussehen, schlechte Erholung zwischen Qualitätstagen, oder der Warnsignal-Cluster. Sachlich benennen, Konsequenz fürs Zielrennen einordnen, keine Dramatik.

## Sonntagabend-Wochenritual (Runbook)

Wöchentliches Standortbestimmungs-Ritual. **Kein Schedule** — der Athlet triggert Sonntagabend selbst. Der Store persistiert: kein durchgehender Chat nötig, jede Session (auch mobil) lädt den vollen Kontext nach.

**Wochenkonvention (hart):** Woche = Montag–Sonntag (ISO-KW). Der Lauf wertet die **gerade abgeschlossene Mo–So-Woche aus, die heute (So) endet** (= aktuelle KW) und skizziert die **kommende Mo–So-Woche** als Entwurf. **Sonntags-Edge:** Longrun kann schon gelaufen oder noch offen sein — kurz prüfen (Ist-Läufe + nachfragen), bevor die Woche abgeschlossen wird.

1. **Kontext laden:** `get_steuerungsplan()`; `list_wochen()`, dann `get_woche(aktuelle KW)` (enthält schon den Entwurf + subjektive Notizen) + `get_woche(Vorwoche)`.
2. **Daten ziehen** (deferred zuerst per `tool_search`): Ist-Läufe der abgeschlossenen Woche (Mo 00:00 – So 23:59) mit Schlüsseleinheiten; Coach-Plan (falls vorhanden) für 7 Tage; Körperdaten-Range über die Woche.
3. **Rückblick:** Soll/Ist gegen den **Entwurf im aktuellen Wochen-Key** + subjektive Nachträge. Volumen, Schlüsseleinheiten, Pace-Targets vs. real, HF/Laktat wo vorhanden. **km-Spalte auf Ist umstellen** (Plan-Schätzungen durch Strava-Tagessummen ersetzen) und **Σ Woche auf reines Ist** setzen. Multisport als aerobe Last (nicht in die Lauf-km). Körperdaten-Overlay (RHR-Trend, HRV-Wochenmittel, Schlaf, Cluster). Fit zur Phase, auf Renn-Ziel-Kurs, Überlastung proaktiv flaggen.
4. **Entwurf kommende Woche:** Coach-Einheiten gegen das Ziel interpretieren (bzw. selbst planen), konkreter Tages-Entwurf Mo–So **mit km-Schätzung pro Tag (`~N (Plan)`) und `Σ Woche`-Plansumme**. Eigene Einheiten nur, wo der Coach-Plan schlecht passt. Kraft/Stabi schlank. **Klar als Entwurf markieren, kein Befehl** — der Athlet schränkt danach ein. Knapp, Tag für Tag.
5. **In den Store schreiben (Whole-Object):**
   - **Aktuelle KW:** `set_woche(aktuelle KW, …)` mit der **kompletten** Woche = Entwurf (B) + neuer Rückblick (A) + Subjektives, zusammengeführt, **km-Spalte auf Ist + Σ auf Ist**. Vorher Gelesenes einbauen, nichts verlieren (Key wird komplett überschrieben).
   - **Kommende KW:** `set_woche(kommende KW, …)` mit dem **Entwurf** (Teil B; Rückblick folgt nächsten Sonntag in denselben Key), inkl. km-Plan-Spalte + Σ-Plan.
   - **Form-Snapshot verschoben?** `set_steuerungsplan(…)` mit dem komplett neu gebauten Plan (Snapshot-Zahlen aktualisiert + Änderungslog-Zeile mit Datum). Größere strukturelle Umbauten → Makro-Skill.
6. **Kurzbericht:** knapp (Rückblick, Fit zum Plan, Erholungslage, **Wochen-km Ist + Entwurf-Σ**, Entwurf zum Bestätigen/Einschränken, Flags). Hinweis, dass der volle Eintrag im Wochen-Key steht und im Chat anpassbar ist.

## Tägliche Autoregulation (im Chat)

Unter der Woche: fragt der Athlet nach einer Einheit oder spricht über seine Tagesform → `get_koerperdaten(heute)` + die für heute geplante Einheit → ggf. anpassen (entschärfen, schieben, grünes Licht). Roh-Marker lesen, Readiness wie oben nachrangig.

**Subjektives Feedback fließt über den Chat in den Store:** Erwähnt der Athlet, wie sich eine Einheit angefühlt hat, schreibt **der Agent** es via `set_woche(laufende KW, …)` in die laufende Woche (ganzen Key neu schreiben, Bestehendes erhalten). Wird dabei ein durchgeführter Tag erwähnt/bestätigt, **gleich die km-Spalte dieses Tags auf Ist nachziehen** (Strava-Tagessumme), Σ aktualisieren. Der Athlet editiert den Store nicht selbst.

## Aufbau des Steuerungsplans (Referenz fürs Onboarding/Updates)

Rohes Markdown, grob: **Konfiguration** (Coach + Quelle, Zielrennen) · **Wer & Ziel** · **Form-Snapshot** (Stand-Datum, Fitness-Kennzahl, Anker-Paces) · **Erholungs-Baseline** (sofern Körperdaten) · **Strategische Entscheidungen** · **Trainingsblock** · **Offene Punkte** · **Datenquellen** · **Änderungslog**. Beim Schreiben immer den ganzen Plan neu bauen (Whole-Object).

## Begriff: Doppelschwelle (Norwegian-Style)

**Doppelschwelle = zwei separate Schwelleneinheiten am SELBEN Tag** (z. B. vormittags + abends), beide knapp unter LT2, kontrolliert/laktatgesteuert. **Nicht** dasselbe wie zwei Schwellen-*Tage* in der Woche (Di + Do = „zwei Schwellentage") oder eine Einheit mit zwei Blöcken (2×15 min = *eine* Subthreshold-Einheit). Den Begriff nur verwenden, wenn an einem Tag wirklich zwei getrennte Sessions stehen.

## Output

Sprache wie der Athlet (hier Deutsch). Eher ausführlich, Tabellen okay. Pace in min/km, Wochentabellen mit km-Spalte + Σ. Direkt und ehrlich – keine Beschönigung, keine künstliche Härte.
