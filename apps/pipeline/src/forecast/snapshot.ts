import type { Env } from '../types';
import { storeForecast, type ForecastOutcomeInput } from './store';
import { publishLive } from '../live/publish';

const STRATEGIES = ['none', 'republican', 'left-unity', 'rn-alliance'] as const;
const BASELINES = [2022, 2024] as const;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`GET ${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function alreadyStored(env: Env, inputsHash: string, day: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM forecast_runs
     WHERE inputs_hash = ? AND substr(created_at, 1, 10) = ?
     LIMIT 1`,
  )
    .bind(inputsHash, day)
    .first<{ id: string }>();
  return Boolean(row);
}

/**
 * Daily compact snapshot: national seat totals and presidential win
 * probabilities. Full constituency-level outcomes are still available through
 * `scripts/store_forecasts.mjs` when a full audit is needed.
 */
export async function snapshotForecasts(env: Env): Promise<{
  stored: number;
  skipped: number;
  runs: Array<{ kind: string; runId?: string; skipped?: boolean; error?: string }>;
}> {
  if (!env.SITE_URL) throw new Error('SITE_URL is not configured');
  const base = env.SITE_URL.replace(/\/$/, '');
  const day = new Date().toISOString().slice(0, 10);
  const runs: Array<{ kind: string; runId?: string; skipped?: boolean; error?: string }> = [];
  let stored = 0;
  let skipped = 0;

  try {
    const projection = await getJson<any>(`${base}/api/v1/projection`);
    const outcomes: ForecastOutcomeInput[] = [];
    for (const candidate of projection.selected ?? []) {
      outcomes.push({
        candidate_id: candidate.candidate_id,
        metric: 'national_win_prob',
        value: projection.national?.win_prob?.[candidate.party_id] ?? 0,
      });
    }
    // Keep the 10 most uncertain departments, which are the useful ones for
    // tracking interval movement over time.
    const departments = Object.values(projection.departments ?? {})
      .sort((a: any, b: any) => a.win_prob - b.win_prob)
      .slice(0, 10);
    for (const department of departments as any[]) {
      outcomes.push({
        candidate_id: department.shares?.[0]?.candidate_id ?? null,
        metric: 'win_prob',
        value: department.win_prob,
        p10: department.winner_pct_p10,
        p90: department.winner_pct_p90,
        scope_code: department.code,
        label: department.name,
      });
    }
    const inputsHash = await sha256(JSON.stringify({ kind: 'presidential', model: projection.model, selected: projection.selected }));
    if (await alreadyStored(env, inputsHash, day)) {
      runs.push({ kind: 'presidential', skipped: true });
      skipped += 1;
    } else {
      const result = await storeForecast(env, {
        kind: 'presidential_projection',
        election_id: 'pres-2027-t1',
        model_version: projection.model,
        inputs_hash: inputsHash,
        seed: projection.uncertainty?.seed ?? 20270418,
        outcomes,
      });
      runs.push({ kind: 'presidential', runId: result.runId });
      stored += 1;
    }
  } catch (error) {
    runs.push({ kind: 'presidential', error: error instanceof Error ? error.message : String(error) });
  }

  for (const baseline of BASELINES) {
    for (const strategy of STRATEGIES) {
      const kind = `legislative:${baseline}:${strategy}`;
      try {
        const scenario = await getJson<any>(
          `${base}/api/v1/legislative?baseline=${baseline}&strategy=${strategy}`,
        );
        const outcomes: ForecastOutcomeInput[] = Object.entries(scenario.seats ?? {}).map(
          ([bloc, seats]) => ({
            metric: 'seats',
            value: Number(seats),
            p10: scenario.seat_prob?.[bloc]?.p10 ?? null,
            p90: scenario.seat_prob?.[bloc]?.p90 ?? null,
            label: bloc,
          }),
        );
        const inputsHash = await sha256(
          JSON.stringify({ kind, model: scenario.model, baseline, strategy }),
        );
        if (await alreadyStored(env, inputsHash, day)) {
          runs.push({ kind, skipped: true });
          skipped += 1;
          continue;
        }
        const result = await storeForecast(env, {
          kind: 'legislative_projection',
          election_id: 'leg-2027-t1',
          model_version: scenario.model,
          inputs_hash: inputsHash,
          seed: scenario.uncertainty?.seed ?? 20270613,
          outcomes,
        });
        runs.push({ kind, runId: result.runId });
        stored += 1;
      } catch (error) {
        runs.push({ kind, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  if (stored > 0) await publishLive(env, { type: 'forecasts', stored, skipped });
  return { stored, skipped, runs };
}
