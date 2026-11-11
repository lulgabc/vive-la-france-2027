-- Official 2022 parrainages from the Conseil constitutionnel, aggregated by candidate.
-- 2027 official parrainages are not published yet; this is a historical structural prior,
-- not a 2027 endorsement.
CREATE TABLE IF NOT EXISTS parrainage_baseline (
  id TEXT PRIMARY KEY,
  cycle INTEGER NOT NULL,
  candidate_name TEXT NOT NULL,
  candidate_id TEXT,
  bloc TEXT NOT NULL,
  total INTEGER NOT NULL,
  departments INTEGER NOT NULL,
  top_office TEXT,
  office_counts_json TEXT,
  source_url TEXT NOT NULL,
  as_of TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (cycle, candidate_name)
);

CREATE INDEX IF NOT EXISTS idx_parrainage_cycle_bloc ON parrainage_baseline(cycle, bloc);
