import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonResponse, readScores } from '../../../lib/api';

export const GET: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  const payload = await readScores(db);
  return jsonResponse(payload, {}, request);
};
