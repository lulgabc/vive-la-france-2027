import type { Env } from '../types';
import { storeForecast, type ForecastOutcomeInput } from './store';
import { publishLive } from '../live/publish';

const STRATEGIES = ['none', 'republican', 'left-unity', 'rn-alliance'] as const;
const BASELINES = [2022, 2024] as const;

export const SNAPSHOT_KINDS = [
  'presidential',
  ...BASELINES.flatMap((baseline) => STRATEGIES.map((strategy) => `legislative:${baseline}:${strategy}`)),
] as const;

/**
 * A single invocation only has so much CPU budget. Nine scenarios with 80-500
 * Monte Carlo draws each can exhaust it, so the work is split into small
 * batches and tracked in KV until the day's set is complete.
 */
const DEFAULT_BATCH_SIZE = 3;
const DONE_KEY = (day: string) => `forecast:snapshot:done:${day}`;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

async function getJson<T>(env: Env, base: string, path: string): Promise<T> {
  const url = `${base}${path}`;
  const request = new Request(env.WEB ? `https://web.internal${path}` : url, {
    headers: { accept: 'application/json' },
  });
  const response = env.WEB ? await env.WEB.fetch(request) : await fetch(request);
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

async function readDone(env: Env, day: string): Promise<string[]> {
  if (!env.CACHE) return [];
  const raw = await env.CACHE.get(DONE_KEY(day));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((kind) => typeof kind === 'string') : [];
  } catch {
    return [];
  }
}

async function writeDone(env: Env, day: string, kinds: string[]): Promise<void> {
  if (!env.CACHE) return;
  await env.CACHE.put(DONE_KEY(day), JSON.stringify([...new Set(kinds)]), {
    expirationTtl: 60 * 60 * 48,
  });
}

type SnapshotRun = { kind: string; runId?: string; skipped?: boolean; error?: string };

async function runPresidential(env: Env, base: string, day: string): Promise<SnapshotRun> {
  const projection = await getJson<any>(env, base, '/api/v1/projection?draws=120');
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
  const inputsHash = await sha256(
    JSON.stringify({ kind: 'presidential', model: projection.model, selected: projection.selected }),
  );
  if (await alreadyStored(env, inputsHash, day)) {
    return { kind: 'presidential', skipped: true };
  }
  const result = await storeForecast(env, {
    kind: 'presidential_projection',
    election_id: 'pres-2027-t1',
    model_version: projection.model,
    inputs_hash: inputsHash,
    seed: projection.uncertainty?.seed ?? 20270418,
    outcomes,
  });
  return { kind: 'presidential', runId: result.runId };
}

async function runLegislative(
  env: Env,
  base: string,
  day: string,
  baseline: (typeof BASELINES)[number],
  strategy: (typeof STRATEGIES)[number],
): Promise<SnapshotRun> {
  const kind = `legislative:${baseline}:${strategy}`;
  const scenario = await getJson<any>(
    env,
    base,
    `/api/v1/legislative?baseline=${baseline}&strategy=${strategy}&draws=80`,
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
  const inputsHash = await sha256(JSON.stringify({ kind, model: scenario.model, baseline, strategy }));
  if (await alreadyStored(env, inputsHash, day)) {
    return { kind, skipped: true };
  }
  const result = await storeForecast(env, {
    kind: 'legislative_projection',
    election_id: 'leg-2027-t1',
    model_version: scenario.model,
    inputs_hash: inputsHash,
    seed: scenario.uncertainty?.seed ?? 20270613,
    outcomes,
  });
  return { kind, runId: result.runId };
}

/**
 * Daily compact snapshot: national seat totals and presidential win
 * probabilities. Full constituency-level outcomes are still available through
 * `scripts/store_forecasts.mjs` when a full audit is needed.
 *
 * Without explicit `kinds`, a small batch of not-yet-stored scenarios is
 * processed so a single invocation stays inside the Worker CPU budget.
 */
export async function snapshotForecasts(
  env: Env,
  options: { kinds?: string[]; limit?: number } = {},
): Promise<{
  stored: number;
  skipped: number;
  remaining: number;
  runs: SnapshotRun[];
}> {
  if (!env.SITE_URL) throw new Error('SITE_URL is not configured');
  const base = env.SITE_URL.replace(/\/$/, '');
  const day = new Date().toISOString().slice(0, 10);
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_BATCH_SIZE, SNAPSHOT_KINDS.length));
  const done = await readDone(env, day);

  const requested = options.kinds?.length
    ? SNAPSHOT_KINDS.filter((kind) => options.kinds?.includes(kind))
    : SNAPSHOT_KINDS;
  const pending = requested.filter((kind) => !done.includes(kind));
  const queue = (pending.length > 0 ? pending : requested).slice(0, limit);

  const runs: SnapshotRun[] = [];
  let stored = 0;
  let skipped = 0;

  for (const kind of queue) {
    try {
      const run = kind === 'presidential'
        ? await runPresidential(env, base, day)
        : await runLegislative(
            env,
            base,
            day,
            Number(kind.split(':')[1]) as (typeof BASELINES)[number],
            kind.split(':')[2] as (typeof STRATEGIES)[number],
          );
      runs.push(run);
      if (run.runId) stored += 1;
      if (run.skipped) skipped += 1;
      if (run.runId || run.skipped) done.push(kind);
    } catch (error) {
      runs.push({ kind, error: error instanceof Error ? error.message : String(error) });
    }
  }

  await writeDone(env, day, done);

  const remaining = requested.filter((kind) => !done.includes(kind)).length;
  if (stored > 0) await publishLive(env, { type: 'forecasts', stored, skipped, remaining });
  return { stored, skipped, remaining, runs };
}
