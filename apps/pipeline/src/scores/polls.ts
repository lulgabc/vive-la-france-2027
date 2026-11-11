import { newId, nowIso } from '@vlf/db';
import type { Env } from '../types';

export async function aggregatePolls(env: Env, windowDays = 60): Promise<{ candidates: number; polls: number }> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.fieldwork_end, p.sample_size, r.candidate_id, r.pct
     FROM polls p
     JOIN poll_results r ON r.poll_id = p.id
     WHERE p.status = 'published'
       AND p.fieldwork_end >= ?
       AND r.candidate_id IS NOT NULL`,
  )
    .bind(since)
    .all<{ id: string; fieldwork_end: string; sample_size: number; candidate_id: string; pct: number }>();

  const groups = new Map<
    string,
    { sum: number; weight: number; polls: Set<string>; last: string }
  >();

  for (const row of results) {
    const ageDays = Math.max(0, (Date.now() - new Date(`${row.fieldwork_end}T12:00:00Z`).getTime()) / 86_400_000);
    const sampleWeight = Math.sqrt(Math.max(1, row.sample_size) / 1000);
    const recencyWeight = Math.exp(-ageDays / 21);
    const weight = sampleWeight * recencyWeight;
    const group = groups.get(row.candidate_id) ?? { sum: 0, weight: 0, polls: new Set<string>(), last: '' };
    group.sum += row.pct * weight;
    group.weight += weight;
    group.polls.add(row.id);
    if (row.fieldwork_end > group.last) group.last = row.fieldwork_end;
    groups.set(row.candidate_id, group);
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const statements = [...groups.entries()].map(([candidateId, group]) =>
    env.DB.prepare(
      `INSERT OR REPLACE INTO poll_averages
        (id, candidate_id, as_of, avg, polls, last_poll_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId('pollavg'),
      candidateId,
      asOf,
      group.weight > 0 ? group.sum / group.weight : 0,
      group.polls.size,
      group.last || null,
      nowIso(),
    ),
  );

  if (statements.length > 0) await env.DB.batch(statements);
  return { candidates: groups.size, polls: new Set(results.map((row) => row.id)).size };
}
