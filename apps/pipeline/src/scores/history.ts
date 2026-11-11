import { candidates } from '@vlf/domain';
import type { Env } from '../types';

interface PollRow {
  id: string;
  fieldwork_end: string;
  sample_size: number;
  candidate_id: string;
  pct: number;
}

interface MarketRow {
  candidate_id: string;
  ts: string;
  implied_prob: number;
}

export async function backfillScoreHistory(env: Env, days = 60): Promise<{ rows: number }> {
  const [pollRows, marketRows] = await Promise.all([
    env.DB.prepare(
      `SELECT p.id, p.fieldwork_end, p.sample_size, r.candidate_id, r.pct
       FROM polls p
       JOIN poll_results r ON r.poll_id = p.id
       WHERE p.status = 'published' AND r.candidate_id IS NOT NULL
       ORDER BY p.fieldwork_end ASC`,
    ).all<PollRow>(),
    env.DB.prepare(
      `SELECT m.candidate_id, s.ts, s.implied_prob
       FROM markets m
       JOIN market_snapshots s ON s.market_id = m.id
       WHERE m.platform = 'polymarket'
         AND m.candidate_id IS NOT NULL
         AND m.market_key LIKE '%:victoire:%'
       ORDER BY s.ts ASC`,
    ).all<MarketRow>(),
  ]);

  const marketByCandidate = new Map<string, Array<{ date: string; p: number }>>();
  for (const row of marketRows.results) {
    const list = marketByCandidate.get(row.candidate_id) ?? [];
    list.push({ date: row.ts.slice(0, 10), p: row.implied_prob });
    marketByCandidate.set(row.candidate_id, list);
  }

  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${today}T00:00:00Z`).getTime();
  const statements = [];
  let rows = 0;

  for (let cursor = startMs; cursor <= endMs; cursor += 86_400_000) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    if (date === today) continue;

    const pollAvg = new Map<string, number>();
    const pollWeight = new Map<string, number>();
    for (const poll of pollRows.results) {
      if (poll.fieldwork_end > date) continue;
      const ageDays = Math.max(0, (cursor - new Date(`${poll.fieldwork_end}T12:00:00Z`).getTime()) / 86_400_000);
      if (ageDays > 60) continue;
      const weight = Math.sqrt(Math.max(1, poll.sample_size) / 1000) * Math.exp(-ageDays / 21);
      pollAvg.set(poll.candidate_id, (pollAvg.get(poll.candidate_id) ?? 0) + poll.pct * weight);
      pollWeight.set(poll.candidate_id, (pollWeight.get(poll.candidate_id) ?? 0) + weight);
    }

    const averages = new Map<string, number>();
    for (const [candidateId, sum] of pollAvg) {
      const weight = pollWeight.get(candidateId) ?? 0;
      if (weight > 0) averages.set(candidateId, sum / weight);
    }
    const maxPoll = Math.max(1, ...averages.values());

    for (const candidate of candidates) {
      const avg = averages.get(candidate.id);
      if (typeof avg !== 'number') continue;

      let market: number | null = null;
      for (const point of marketByCandidate.get(candidate.id) ?? []) {
        if (point.date <= date) market = point.p;
        else break;
      }

      const pollNorm = (avg / maxPoll) * 100;
      const marketNorm = market !== null ? market * 100 : null;
      const available = 45 + (marketNorm !== null ? 20 : 0);
      const composite = (45 * pollNorm + (marketNorm !== null ? 20 * marketNorm : 0)) / available;

      statements.push(
        env.DB.prepare(
          `INSERT OR REPLACE INTO score_history (id, entity_id, as_of, composite, components_json)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(
          `hist_${candidate.id}_${date}`,
          candidate.id,
          date,
          composite,
          JSON.stringify({
            poll: avg,
            market,
            media: null,
            social: null,
            elite: null,
            mode: 'poll+market-historical',
            demo: false,
          }),
        ),
      );
      rows += 1;
    }
  }

  if (statements.length > 0) await env.DB.batch(statements);
  return { rows };
}
