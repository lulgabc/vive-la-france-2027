import type { APIRoute } from 'astro';
import { results2022 } from '@vlf/domain';
import { env } from 'cloudflare:workers';
import { jsonResponse, readPollAverages } from '../../../lib/api';
import { buildProjection } from '../../../lib/projection';

export const GET: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  const averages = await readPollAverages(db);
  return jsonResponse(buildProjection(results2022.departments, averages.data as any), {
    headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' },
  }, request);
};
