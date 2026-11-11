import { newId, nowIso } from '@vlf/db';
import { finishRun, startRun } from '../lib/db';
import type { Env } from '../types';

const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';
const FRANCE_KEYWORDS = ['french', 'france', 'presidentielle', 'présidentielle', 'macron', 'le pen', 'bardella'];

function isFranceMarket(title: string): boolean {
  const text = title.toLowerCase();
  return FRANCE_KEYWORDS.some((keyword) => text.includes(keyword));
}

export async function runKalshi(env: Env): Promise<{ items: number; errors: number }> {
  const runId = await startRun(env, 'kalshi');
  let items = 0;
  let errors = 0;

  try {
    const response = await fetch(`${KALSHI_API}/events?limit=200&status=open`, {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: 300 },
    } as any);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      events?: Array<{ event_ticker: string; title: string; category?: string }>;
    };

    const events = (payload.events ?? []).filter((event) => isFranceMarket(event.title));
    for (const event of events) {
      const marketResponse = await fetch(
        `${KALSHI_API}/markets?event_ticker=${encodeURIComponent(event.event_ticker)}&limit=100&status=open`,
        { headers: { accept: 'application/json' }, cf: { cacheTtl: 300 } } as any,
      );
      if (!marketResponse.ok) {
        errors += 1;
        continue;
      }
      const marketPayload = (await marketResponse.json()) as {
        markets?: Array<{
          ticker: string;
          title?: string;
          yes_sub_title?: string;
          close_time?: string;
          last_price_dollars?: string;
          volume_dollars?: string;
          liquidity_dollars?: string;
        }>;
      };

      for (const market of marketPayload.markets ?? []) {
        const marketId = `mk_kalshi_${market.ticker}`;
        const question = market.title ?? market.yes_sub_title ?? event.title;
        const price = Number(market.last_price_dollars ?? 0);

        await env.DB.prepare(
          `INSERT OR IGNORE INTO markets
            (id, platform, market_key, question, resolution_date, liquidity, source_url)
           VALUES (?, 'kalshi', ?, ?, ?, ?, ?)`,
        )
          .bind(
            marketId,
            market.ticker,
            question,
            market.close_time ?? null,
            Number(market.liquidity_dollars ?? 0),
            `https://kalshi.com/markets/${market.ticker}`,
          )
          .run();

        await env.DB.prepare(
          `INSERT INTO market_snapshots
            (id, market_id, ts, outcome, implied_prob, volume, raw_json)
           VALUES (?, ?, ?, 'yes', ?, ?, ?)`,
        )
          .bind(
            newId('snap'),
            marketId,
            nowIso(),
            Number.isFinite(price) ? price : 0,
            Number(market.volume_dollars ?? 0),
            JSON.stringify(market),
          )
          .run();

        items += 1;
      }
    }
  } catch (error) {
    errors += 1;
    console.error('kalshi failed', error);
  }

  await finishRun(env, runId, errors > 0 ? 'partial' : 'ok', items, errors);
  return { items, errors };
}
