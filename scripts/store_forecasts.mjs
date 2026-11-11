#!/usr/bin/env node
/**
 * Store the current presidential and legislative scenarios in D1.
 * Usage: node scripts/store_forecasts.mjs
 * Env: WEB_URL (default http://localhost:4321), PIPELINE_URL (default http://127.0.0.1:8787),
 *      ADMIN_TOKEN (default dev-token).
 */
import { createHash } from 'node:crypto';

const WEB = process.env.WEB_URL ?? 'http://localhost:4321';
const PIPELINE = process.env.PIPELINE_URL ?? 'http://127.0.0.1:8787';
const TOKEN = process.env.ADMIN_TOKEN ?? 'dev-token';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);

async function getJson(path) {
  const response = await fetch(`${WEB}${path}`);
  if (!response.ok) throw new Error(`GET ${path}: HTTP ${response.status}`);
  return response.json();
}

async function store(payload) {
  const response = await fetch(`${PIPELINE}/admin/forecast/store`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': TOKEN },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`store failed: ${JSON.stringify(body)}`);
  return body;
}

const projection = await getJson('/api/v1/projection');
const projectionOutcomes = [];
for (const department of Object.values(projection.departments)) {
  const winner = department.shares?.[0];
  if (!winner) continue;
  projectionOutcomes.push({
    candidate_id: winner.candidate_id,
    metric: 'winner_share',
    value: department.winner_pct,
    p10: department.winner_pct_p10,
    p90: department.winner_pct_p90,
    scope_code: department.code,
    label: department.name,
  });
  projectionOutcomes.push({
    candidate_id: winner.candidate_id,
    metric: 'win_prob',
    value: department.win_prob,
    scope_code: department.code,
    label: department.name,
  });
}
for (const candidate of projection.selected) {
  projectionOutcomes.push({
    candidate_id: candidate.candidate_id,
    metric: 'national_win_prob',
    value: projection.national?.win_prob?.[candidate.party_id] ?? 0,
  });
}

const projectionRun = await store({
  kind: 'presidential_projection',
  election_id: 'pres-2027-t1',
  model_version: projection.model,
  inputs_hash: hash({ model: projection.model, selected: projection.selected }),
  seed: projection.uncertainty?.seed ?? 20270418,
  outcomes: projectionOutcomes,
});
console.log('presidential', projectionRun);

for (const baseline of [2022, 2024]) {
  for (const strategy of ['none', 'republican', 'left-unity', 'rn-alliance']) {
    const scenario = await getJson(`/api/v1/legislative?baseline=${baseline}&strategy=${strategy}`);
    const outcomes = [];
    for (const constituency of Object.values(scenario.constituencies)) {
      outcomes.push({
        metric: 'winner_share',
        value: constituency.winner_pct,
        scope_code: constituency.code,
        label: `${constituency.name} (${constituency.department_code})`,
      });
      outcomes.push({
        metric: 'win_prob',
        value: constituency.win_prob,
        scope_code: constituency.code,
        label: `${constituency.name} (${constituency.department_code})`,
      });
    }
    for (const [bloc, seats] of Object.entries(scenario.seats)) {
      outcomes.push({
        metric: 'seats',
        value: seats,
        p10: scenario.seat_prob?.[bloc]?.p10 ?? null,
        p90: scenario.seat_prob?.[bloc]?.p90 ?? null,
        label: bloc,
      });
    }
    const run = await store({
      kind: 'legislative_projection',
      election_id: 'leg-2027-t1',
      model_version: scenario.model,
      inputs_hash: hash({ model: scenario.model, baseline, strategy }),
      seed: scenario.uncertainty?.seed ?? 20270613,
      outcomes,
    });
    console.log(`legislative ${baseline}/${strategy}`, run);
  }
}
