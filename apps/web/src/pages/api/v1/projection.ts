import type { APIRoute } from 'astro';
import { results2022 } from '@vlf/domain';
import { env } from 'cloudflare:workers';
import { jsonResponse, readPollAverages } from '../../../lib/api';
import { buildProjection } from '../../../lib/projection';

export const GET: APIRoute = async ({ request, url }) => {
  const db = (env as any).DB as D1Database | undefined;
  const averages = await readPollAverages(db);
  const draws = Math.min(Math.max(Number(url.searchParams.get('draws') ?? '500'), 80), 2000);
  return jsonResponse(buildProjection(results2022.departments, averages.data as any, { draws }), {
    headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' },
  }, request);
};
