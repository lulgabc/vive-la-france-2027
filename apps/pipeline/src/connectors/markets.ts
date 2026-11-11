import { runKalshi } from './kalshi';
import { runSondaxMarkets } from './sondax-markets';
import { runMetaculus } from './metaculus';
import { runPolymarket } from './polymarket';
import type { Env } from '../types';
import { publishLive } from '../live/publish';

export async function runMarkets(env: Env): Promise<{
  kalshi: { items: number; errors: number };
  polymarket: { items: number; errors: number };
  metaculus: { items: number; errors: number; skipped?: boolean };
}> {
  const [kalshi, polymarket, metaculus] = await Promise.all([
    runKalshi(env).catch((error) => {
      console.error('kalshi crashed', error);
      return { items: 0, errors: 1 };
    }),
    runSondaxMarkets(env).catch((error) => {
      console.error('polymarket crashed', error);
      return { items: 0, errors: 1 };
    }),
    runMetaculus(env).catch((error) => {
      console.error('metaculus crashed', error);
      return { items: 0, errors: 1 };
    }),
  ]);
  return { kalshi, polymarket, metaculus };
}
