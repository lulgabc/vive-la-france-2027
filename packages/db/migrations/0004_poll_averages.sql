CREATE TABLE IF NOT EXISTS poll_averages (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  as_of TEXT NOT NULL,
  avg REAL NOT NULL,
  polls INTEGER NOT NULL DEFAULT 0,
  last_poll_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (candidate_id, as_of)
);

CREATE INDEX IF NOT EXISTS idx_poll_averages_asof ON poll_averages(as_of);
