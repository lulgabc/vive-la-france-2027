import { chunk, newId, nowIso } from '@vlf/db';
import type { Env } from '../types';

export interface ForecastOutcomeInput {
  candidate_id?: string | null;
  constituency_id?: string | null;
  metric: string;
  value: number;
  p10?: number | null;
  p90?: number | null;
  scope_code?: string | null;
  label?: string | null;
}

export interface ForecastPayload {
  kind: string;
  model_version: string;
  inputs_hash: string;
  seed: number;
  election_id?: string;
  outcomes: ForecastOutcomeInput[];
}

export async function storeForecast(env: Env, payload: ForecastPayload) {
  if (!payload.model_version || !payload.inputs_hash) {
    throw new Error('model_version and inputs_hash are required');
  }
  if (!Array.isArray(payload.outcomes) || payload.outcomes.length === 0) {
    throw new Error('outcomes[] is required');
  }
  if (payload.outcomes.length > 5000) {
    throw new Error('too many outcomes (max 5000)');
  }

  const electionId =
    payload.election_id ??
    (payload.kind.includes('legislative') ? 'leg-2027-t1' : 'pres-2027-t1');
  const election = await env.DB.prepare('SELECT id FROM elections WHERE id = ?')
    .bind(electionId)
    .first<{ id: string }>();
  if (!election) throw new Error(`unknown election_id: ${electionId}`);

  const runId = newId('fcst');
  await env.DB.prepare(
    `INSERT INTO forecast_runs (id, model_version, election_id, created_at, inputs_hash, seed)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(runId, payload.model_version, electionId, nowIso(), payload.inputs_hash, payload.seed)
    .run();

  let written = 0;
  for (const batch of chunk(payload.outcomes, 50)) {
    const statements = batch.map((outcome) =>
      env.DB.prepare(
        `INSERT INTO forecast_outcomes
          (id, run_id, candidate_id, constituency_id, metric, value, p10, p90, scope_code, label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        newId('fout'),
        runId,
        outcome.candidate_id ?? null,
        outcome.constituency_id ?? null,
        outcome.metric,
        outcome.value,
        outcome.p10 ?? null,
        outcome.p90 ?? null,
        outcome.scope_code ?? null,
        outcome.label ?? null,
      ),
    );
    await env.DB.batch(statements);
    written += statements.length;
  }

  return { runId, electionId, outcomes: written };
}

export async function listForecastRuns(env: Env, limit = 20) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.model_version, r.election_id, r.created_at, r.inputs_hash, r.seed,
            COUNT(o.id) AS outcomes
     FROM forecast_runs r
     LEFT JOIN forecast_outcomes o ON o.run_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at DESC
     LIMIT ?`,
  )
    .bind(Math.min(Math.max(limit, 1), 100))
    .all();
  return results;
}

export async function getForecastRun(env: Env, id: string) {
  const run = await env.DB.prepare('SELECT * FROM forecast_runs WHERE id = ?').bind(id).first();
  if (!run) return null;
  const { results } = await env.DB.prepare(
    `SELECT candidate_id, constituency_id, metric, value, p10, p90, scope_code, label
     FROM forecast_outcomes WHERE run_id = ? ORDER BY metric, scope_code`,
  )
    .bind(id)
    .all();
  return { ...run, outcomes: results };
}
