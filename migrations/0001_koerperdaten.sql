-- Körperdaten-Archiv (archive-first): ein JSON-Blob pro (user_id, date) mit der
-- schlanken formatKoerperdaten-Form. Siehe src/garmin/docs/adr/0001.
CREATE TABLE IF NOT EXISTS koerperdaten (
  user_id TEXT NOT NULL,
  date    TEXT NOT NULL,
  data    TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
