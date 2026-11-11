import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonResponse, readFeed } from '../../../lib/api';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const db = (env as any).DB as D1Database | undefined;
  const payload = await readFeed(db, {
    source: url.searchParams.get('source') ?? undefined,
    topic: url.searchParams.get('topic') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    limit: Number(url.searchParams.get('limit') ?? 20),
    offset: Number(url.searchParams.get('offset') ?? 0),
    electionOnly: url.searchParams.get('all') !== '1',
  });
  return jsonResponse(payload, {}, request);
};
