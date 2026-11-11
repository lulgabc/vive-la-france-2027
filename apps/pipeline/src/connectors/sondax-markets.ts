import { candidates } from '@vlf/domain';
import { finishRun, startRun } from '../lib/db';
import type { Env } from '../types';

const SONDAX_MARKETS = 'https://sondax.fr/data/polymarket.json';

const CANDIDATES: Record<string, string> = {
  'le-pen': 'marine-le-pen',
  melenchon: 'jean-luc-melenchon',
  philippe: 'edouard-philippe',
  glucksmann: 'raphael-glucksmann',
  attal: 'gabriel-attal',
  bardella: 'jordan-bardella',
  retailleau: 'bruno-retailleau',
  zemmour: 'eric-zemmour',
  'dupont-aignan': 'nicolas-dupont-aignan',
  roussel: 'fabien-roussel',
  lisnard: 'david-lisnard',
  bertrand: 'xavier-bertrand',
  tondelier: 'marine-tondelier',
  arthaud: 'nathalie-arthaud',
  villepin: 'dominique-de-villepin',
  hollande: 'francois-hollande',
  ruffin: 'francois-ruffin',
  faure: 'olivier-faure',
  knafo: 'sarah-knafo',
};

const NAMES = new Map(candidates.map((candidate) => [candidate.id, candidate.full_name]));

export async function runSondaxMarkets(env: Env): Promise<{ items: number; errors: number }> {
  const runId = await startRun(env, 'sondax-polymarket');
  let items = 0;
  let errors = 0;

  try {
    const response = await fetch(SONDAX_MARKETS, {
      headers: { accept: 'application/json', 'user-agent': 'ViveLaFrance2027Bot/0.1' },
      signal: AbortSignal.timeout(30_000),
      cf: { cacheTtl: 1800 },
    } as any);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = (await response.json()) as {
      maj: string;
      marches: Record<
        string,
        { event_slug: string; candidats: Record<string, { prix_actuel: number; historique: Array<{ d: string; p: number }> }> }
      >;
    };

    for (const [type, market] of Object.entries(payload.marches)) {
      const entries = Object.entries(market.candidats).filter(([externalId]) => CANDIDATES[externalId]);
      const total = entries.reduce((sum, [, item]) => sum + Number(item.prix_actuel || 0), 0);
      const normalizer = type === 'victoire' ? total : total / 2;
      if (!normalizer) continue;

      for (const [externalId, item] of entries) {
        const candidateId = CANDIDATES[externalId];
        const name = NAMES.get(candidateId) ?? candidateId;
        const marketKey = `sondax:${market.event_slug}:${type}:${externalId}`;
        const marketId = `mk_poly_${type}_${externalId}`;
        const question =
          type === 'victoire'
            ? `${name} remporte l’élection présidentielle de 2027`
            : `${name} accède au second tour de l’élection présidentielle de 2027`;

        await env.DB.prepare(
          `INSERT OR REPLACE INTO markets
            (id, platform, market_key, question, candidate_id, resolution_date, liquidity, source_url)
           VALUES (?, 'polymarket', ?, ?, ?, NULL, NULL, ?)`,
        )
          .bind(
            marketId,
            marketKey,
            question,
            candidateId,
            `https://polymarket.com/event/${market.event_slug}`,
          )
          .run();

        const snapshots = [
          { d: payload.maj.slice(0, 10), p: item.prix_actuel },
          ...item.historique.slice(-30),
        ];
        for (const point of snapshots) {
          const probability = Math.max(0, Math.min(1, Number(point.p) / normalizer));
          await env.DB.prepare(
            `INSERT OR REPLACE INTO market_snapshots
              (id, market_id, ts, outcome, implied_prob, volume, raw_json)
             VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
          )
            .bind(`snap_${marketId}_${point.d}`, marketId, `${point.d}T12:00:00Z`, type, probability)
            .run();
        }
        items += 1;
      }
    }
  } catch (error) {
    errors += 1;
    console.error('sondax markets failed', error);
  }

  await finishRun(env, runId, errors > 0 ? 'error' : 'ok', items, errors);
  return { items, errors };
}
