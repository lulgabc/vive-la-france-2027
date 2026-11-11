-- Endorsements and formal political support. Weights are editorial, not probabilities.
CREATE TABLE IF NOT EXISTS endorsements (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  endorser_name TEXT NOT NULL,
  endorser_type TEXT NOT NULL CHECK (endorser_type IN ('party', 'office', 'person', 'union', 'media', 'collective')),
  office TEXT,
  party_id TEXT,
  weight REAL NOT NULL DEFAULT 1,
  announced_at TEXT,
  source_url TEXT NOT NULL,
  source_name TEXT,
  quote TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (candidate_id, endorser_name, source_url)
);

CREATE INDEX IF NOT EXISTS idx_endorsements_candidate ON endorsements(candidate_id, announced_at);
