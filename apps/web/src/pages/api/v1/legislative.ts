import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonResponse, readPollAverages } from '../../../lib/api';
import { buildLegislativeScenario, type BaselineYear, type Strategy } from '../../../lib/legislative';

export const GET: APIRoute = async ({ url, request }) => {
  const db = (env as any).DB as D1Database | undefined;
  const averages = await readPollAverages(db);
  const baselineYear: BaselineYear = url.searchParams.get('baseline') === '2024' ? 2024 : 2022;
  const strategyParam = url.searchParams.get('strategy');
  const strategy: Strategy = (['none', 'republican', 'left-unity', 'rn-alliance'] as const).includes(
    strategyParam as Strategy,
  )
    ? (strategyParam as Strategy)
    : 'none';
  return jsonResponse(buildLegislativeScenario(averages.data as any, { baselineYear, strategy }), {
    headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' },
  }, request);
};
