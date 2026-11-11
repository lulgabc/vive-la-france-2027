-- Vive la France 2027 — operational schema (D1 / SQLite)
-- All timestamps are ISO-8601 UTC strings. IDs are stable slugs or ULIDs.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  color TEXT NOT NULL,
  spectrum TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  party_id TEXT NOT NULL REFERENCES parties(id),
  status TEXT NOT NULL CHECK (status IN ('declared', 'likely', 'potential', 'withdrawn')),
  declared_at TEXT,
  birth_year INTEGER,
  color TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  bio_fr TEXT NOT NULL,
  bio_en TEXT NOT NULL,
  bio_zh TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS elections (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('presidential', 'legislative')),
  round INTEGER NOT NULL,
  election_date TEXT NOT NULL,
  scope TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS constituencies (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('department', 'region', 'circonscription')),
  department_code TEXT,
  region_code TEXT,
  geo_version TEXT NOT NULL DEFAULT '2026'
);

CREATE TABLE IF NOT EXISTS candidacies (
  id TEXT PRIMARY KEY,
  election_id TEXT NOT NULL REFERENCES elections(id),
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  constituency_id TEXT REFERENCES constituencies(id),
  party_id TEXT NOT NULL REFERENCES parties(id),
  ballot_order INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'elected'))
);

CREATE TABLE IF NOT EXISTS pollsters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  house_effect_json TEXT
);

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  pollster_id TEXT NOT NULL REFERENCES pollsters(id),
  sponsor TEXT,
  fieldwork_start TEXT NOT NULL,
  fieldwork_end TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  population TEXT,
  methodology TEXT,
  source_url TEXT NOT NULL,
  pdf_r2_key TEXT,
  commission_notice_url TEXT,
  published_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'published', 'rejected'))
);

CREATE TABLE IF NOT EXISTS poll_results (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  candidate_id TEXT REFERENCES candidates(id),
  party_id TEXT REFERENCES parties(id),
  pct REAL NOT NULL,
  rank INTEGER
);

CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('polymarket', 'kalshi', 'metaculus', 'betfair')),
  market_key TEXT NOT NULL,
  question TEXT NOT NULL,
  resolution_date TEXT,
  liquidity REAL,
  source_url TEXT,
  UNIQUE (platform, market_key)
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  ts TEXT NOT NULL,
  outcome TEXT NOT NULL,
  implied_prob REAL NOT NULL,
  volume REAL,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  country TEXT,
  lang TEXT,
  feed_url TEXT,
  tos_notes TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'fr',
  published_at TEXT,
  excerpt TEXT,
  r2_key TEXT,
  content_hash TEXT,
  simhash TEXT,
  topics_json TEXT,
  sentiment REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_entities (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('candidate', 'party')),
  stance TEXT NOT NULL CHECK (stance IN ('support', 'oppose', 'neutral', 'unclear')),
  confidence REAL NOT NULL,
  evidence_span TEXT,
  UNIQUE (article_id, entity_id)
);

CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('x', 'bluesky', 'mastodon', 'youtube')),
  post_id TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_hash TEXT,
  author_type TEXT,
  text TEXT NOT NULL,
  lang TEXT,
  created_at TEXT NOT NULL,
  like_count INTEGER DEFAULT 0,
  repost_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  url TEXT,
  bot_score REAL,
  candidate_ids_json TEXT,
  party_ids_json TEXT,
  raw_json TEXT,
  UNIQUE (platform, post_id)
);

CREATE TABLE IF NOT EXISTS social_aggregates (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  bucket_hour TEXT NOT NULL,
  posts INTEGER NOT NULL DEFAULT 0,
  unique_authors INTEGER NOT NULL DEFAULT 0,
  engagement INTEGER NOT NULL DEFAULT 0,
  stance_support INTEGER NOT NULL DEFAULT 0,
  stance_oppose INTEGER NOT NULL DEFAULT 0,
  stance_neutral INTEGER NOT NULL DEFAULT 0,
  UNIQUE (platform, entity_id, bucket_hour)
);

CREATE TABLE IF NOT EXISTS judgments (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('article', 'social_post', 'market', 'poll_pdf')),
  subject_id TEXT NOT NULL,
  content_hash TEXT,
  model TEXT NOT NULL,
  question TEXT NOT NULL,
  answer_type TEXT NOT NULL CHECK (answer_type IN ('noul', 'choice', 'score')),
  value TEXT NOT NULL,
  probability REAL,
  confidence REAL,
  usage_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (subject_type, subject_id, question, model)
);

CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('candidate', 'party')),
  as_of TEXT NOT NULL,
  poll_avg REAL,
  market_prob REAL,
  share_of_voice REAL,
  social_attention REAL,
  stance_balance REAL,
  composite REAL,
  components_json TEXT,
  confidence TEXT,
  UNIQUE (entity_id, as_of)
);

CREATE TABLE IF NOT EXISTS score_history (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  as_of TEXT NOT NULL,
  composite REAL NOT NULL,
  components_json TEXT
);

CREATE TABLE IF NOT EXISTS forecast_runs (
  id TEXT PRIMARY KEY,
  model_version TEXT NOT NULL,
  election_id TEXT NOT NULL REFERENCES elections(id),
  created_at TEXT NOT NULL,
  inputs_hash TEXT NOT NULL,
  seed INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS forecast_outcomes (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
  candidate_id TEXT REFERENCES candidates(id),
  constituency_id TEXT REFERENCES constituencies(id),
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  p10 REAL,
  p90 REAL
);

CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  election_id TEXT NOT NULL REFERENCES elections(id),
  constituency_id TEXT REFERENCES constituencies(id),
  candidate_id TEXT REFERENCES candidates(id),
  party_id TEXT REFERENCES parties(id),
  votes INTEGER,
  pct REAL,
  source TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (election_id, constituency_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY,
  connector TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  items INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS x_budget (
  month TEXT PRIMARY KEY,
  reads INTEGER NOT NULL DEFAULT 0,
  cap INTEGER NOT NULL DEFAULT 4000,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_candidates_party ON candidates(party_id);
CREATE INDEX IF NOT EXISTS idx_polls_published ON polls(published_at);
CREATE INDEX IF NOT EXISTS idx_poll_results_poll ON poll_results(poll_id);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_market_ts ON market_snapshots(market_id, ts);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_social_aggregates_entity_bucket ON social_aggregates(entity_id, bucket_hour);
CREATE INDEX IF NOT EXISTS idx_judgments_subject ON judgments(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_scores_entity_asof ON scores(entity_id, as_of);
CREATE INDEX IF NOT EXISTS idx_results_election_constituency ON results(election_id, constituency_id);

-- Full-text search for articles (D1 supports FTS5).
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title,
  excerpt,
  content='articles',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
