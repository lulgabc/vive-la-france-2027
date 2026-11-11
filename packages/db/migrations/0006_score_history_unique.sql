CREATE UNIQUE INDEX IF NOT EXISTS idx_score_history_entity_asof ON score_history(entity_id, as_of);
