CREATE TABLE IF NOT EXISTS media_momentum (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('candidate', 'party')),
  as_of TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  mentions INTEGER NOT NULL DEFAULT 0,
  share REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (entity_id, as_of, window_days)
);

CREATE INDEX IF NOT EXISTS idx_media_momentum_asof ON media_momentum(as_of, window_days);
