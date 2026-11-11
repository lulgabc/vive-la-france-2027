import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonResponse, readSources } from '../../../lib/api';

export const GET: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  return jsonResponse({ source: db ? 'd1' : 'seed', data: await readSources(db) }, {}, request);
};
