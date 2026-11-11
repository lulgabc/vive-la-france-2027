import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonResponse, readPollAverages } from '../../../../lib/api';

export const GET: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  return jsonResponse(await readPollAverages(db), {}, request);
};
