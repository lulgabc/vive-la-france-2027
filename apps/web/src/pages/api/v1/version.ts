import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonResponse, readLatestUpdate } from '../../../lib/api';

export const GET: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  return jsonResponse(
    { updated_at: await readLatestUpdate(db) },
    { headers: { 'cache-control': 'no-store' } },
    request,
  );
};
