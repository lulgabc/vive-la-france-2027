-- Preserve the department/constituency code and a human-readable label on
-- forecast outcomes without requiring a row in `constituencies`.
ALTER TABLE forecast_outcomes ADD COLUMN scope_code TEXT;
ALTER TABLE forecast_outcomes ADD COLUMN label TEXT;

CREATE INDEX IF NOT EXISTS idx_forecast_outcomes_run ON forecast_outcomes(run_id, metric);
