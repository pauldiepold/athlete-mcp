-- Steuerungs-Store (erstes eigenes Write-Modell, Single-Writer-Agent): selbst-
-- geschriebenes rohes Markdown, per user_id. Ein Steuerungsplan pro Nutzer, plus
-- ein Eintrag pro ISO-Woche (kw = YYYY-Www). Siehe docs/adr/0002.
CREATE TABLE IF NOT EXISTS steuerungsplan (
  user_id TEXT PRIMARY KEY,
  content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS steuerung_woche (
  user_id TEXT NOT NULL,
  kw      TEXT NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (user_id, kw)
);
