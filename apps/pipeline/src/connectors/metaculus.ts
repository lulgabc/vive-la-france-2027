import { newId, nowIso } from '@vlf/db';
import { finishRun, startRun } from '../lib/db';
import type { Env } from '../types';

const METACULUS_API = 'https://www.metaculus.com/api2/questions/';

export async function runMetaculus(env: Env): Promise<{ items: number; errors: number; skipped?: boolean }> {
  const runId = await startRun(env, 'metaculus');
  if (!env.METACULUS_TOKEN) {
    await finishRun(env, runId, 'ok', 0, 0, 'METACULUS_TOKEN not configured');
    return { items: 0, errors: 0, skipped: true };
  }

  let items = 0;
  let errors = 0;

  try {
    const url = new URL(METACULUS_API);
    url.searchParams.set('search', 'french president');
    url.searchParams.set('limit', '20');
    url.searchParams.set('order_by', '-activity');

    const response = await fetch(url.toString(), {
      headers: {
        accept: 'application/json',
        authorization: `Token ${env.METACULUS_TOKEN}`,
      },
      signal: AbortSignal.timeout(15_000),
    } as any);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = (await response.json()) as {
      results?: Array<{
        id: number;
        title: string;
        url?: string;
        close_time?: string;
        community_prediction?: { full?: { q2?: number } };
      }>;
    };

    for (const question of payload.results ?? []) {
      const marketId = `mk_meta_${question.id}`;
      const probability = question.community_prediction?.full?.q2;

      await env.DB.prepare(
        `INSERT OR IGNORE INTO markets
          (id, platform, market_key, question, resolution_date, liquidity, source_url)
         VALUES (?, 'metaculus', ?, ?, ?, NULL, ?)`,
      )
        .bind(
          marketId,
          String(question.id),
          question.title,
          question.close_time ?? null,
          question.url ?? `https://www.metaculus.com/questions/${question.id}/`,
        )
        .run();

      if (typeof probability === 'number') {
        await env.DB.prepare(
          `INSERT INTO market_snapshots
            (id, market_id, ts, outcome, implied_prob, volume, raw_json)
           VALUES (?, ?, ?, 'community', ?, NULL, ?)`,
        )
          .bind(
            newId('snap'),
            marketId,
            nowIso(),
            probability,
            JSON.stringify(question),
          )
          .run();
      }
      items += 1;
    }
  } catch (error) {
    errors += 1;
    console.error('metaculus failed', error);
  }

  await finishRun(env, runId, errors > 0 ? 'error' : 'ok', items, errors);
  return { items, errors };
}
