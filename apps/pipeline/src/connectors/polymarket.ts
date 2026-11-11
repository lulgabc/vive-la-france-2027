import { newId, nowIso } from '@vlf/db';
import { finishRun, startRun } from '../lib/db';
import type { Env } from '../types';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const FRANCE_KEYWORDS = ['french', 'france', 'presidentielle', 'présidentielle', 'macron', 'le pen', 'bardella'];

function isFrance(text: string): boolean {
  const lower = text.toLowerCase();
  return FRANCE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function runPolymarket(env: Env): Promise<{ items: number; errors: number }> {
  const runId = await startRun(env, 'polymarket');
  let items = 0;
  let errors = 0;

  try {
    const response = await fetch(`${GAMMA_API}/events?limit=100&active=true&closed=false`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
      cf: { cacheTtl: 300 },
    } as any);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = (await response.json()) as {
      events?: Array<{
        title?: string;
        slug?: string;
        endDate?: string;
        markets?: Array<{
          question?: string;
          conditionId?: string;
          outcomes?: unknown;
          outcomePrices?: unknown;
          volume?: string | number;
          liquidity?: string | number;
        }>;
      }>;
    };

    for (const event of payload.events ?? []) {
      if (!isFrance(`${event.title ?? ''} ${event.slug ?? ''}`)) continue;

      for (const market of event.markets ?? []) {
        const question = market.question ?? event.title ?? 'Polymarket market';
        if (!isFrance(question)) continue;
        const key = market.conditionId ?? `${event.slug}-${question}`;
        const marketId = `mk_poly_${key}`;
        const outcomes = parseJsonArray(market.outcomes);
        const prices = parseJsonArray(market.outcomePrices);

        await env.DB.prepare(
          `INSERT OR IGNORE INTO markets
            (id, platform, market_key, question, resolution_date, liquidity, source_url)
           VALUES (?, 'polymarket', ?, ?, ?, ?, ?)`,
        )
          .bind(
            marketId,
            key,
            question,
            event.endDate ?? null,
            Number(market.liquidity ?? 0),
            `https://polymarket.com/event/${event.slug ?? ''}`,
          )
          .run();

        for (let index = 0; index < Math.min(outcomes.length, prices.length); index += 1) {
          await env.DB.prepare(
            `INSERT INTO market_snapshots
              (id, market_id, ts, outcome, implied_prob, volume, raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              newId('snap'),
              marketId,
              nowIso(),
              outcomes[index],
              Number(prices[index] ?? 0),
              Number(market.volume ?? 0),
              JSON.stringify(market),
            )
            .run();
        }
        items += 1;
      }
    }
  } catch (error) {
    errors += 1;
    console.error('polymarket failed', error);
  }

  await finishRun(env, runId, errors > 0 ? 'error' : 'ok', items, errors);
  return { items, errors };
}
