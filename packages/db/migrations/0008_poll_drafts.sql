-- Poll PDF review queue. Parsed drafts are never published until a human approves them.
CREATE TABLE IF NOT EXISTS poll_drafts (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  pdf_r2_key TEXT,
  notice_number TEXT,
  pollster TEXT,
  sponsor TEXT,
  fieldwork_start TEXT,
  fieldwork_end TEXT,
  sample_size INTEGER,
  population TEXT,
  methodology TEXT,
  commission_notice_url TEXT,
  parsed_json TEXT NOT NULL,
  raw_text TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  checksum TEXT
);

CREATE INDEX IF NOT EXISTS idx_poll_drafts_status ON poll_drafts(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_drafts_checksum ON poll_drafts(checksum);
