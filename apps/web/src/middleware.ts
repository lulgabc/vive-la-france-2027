import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import { readDataVersion } from './lib/api';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (context.request.method !== 'GET') return response;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;
  if (context.url.pathname.startsWith('/sondages/relecture')) return response;

  const db = (env as any).DB as D1Database | undefined;
  const version = await readDataVersion(db);
  const etag = `W/"${version}"`;
  const headers = {
    etag,
    'cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=60',
  };

  if (context.request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
});
