import { GDELT_QUERY } from '../config/sources';
import { canonicalizeUrl, parseGdeltDate, sha256Hex, stripHtml, truncate } from '../lib/hash';
import { finishRun, insertArticle, startRun } from '../lib/db';
import type { Env } from '../types';
import { publishLive } from '../live/publish';

const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

export async function runGdelt(env: Env): Promise<{ items: number; errors: number }> {
  const runId = await startRun(env, 'gdelt');
  let items = 0;
  let errors = 0;

  try {
    const url = new URL(GDELT_ENDPOINT);
    url.searchParams.set('query', GDELT_QUERY);
    url.searchParams.set('mode', 'artlist');
    url.searchParams.set('maxrecords', '50');
    url.searchParams.set('format', 'json');
    url.searchParams.set('sort', 'datedesc');

    const response = await fetch(url.toString(), {
      headers: { 'user-agent': 'ViveLaFrance2027Bot/0.1' },
      cf: { cacheTtl: 600 },
    } as any);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { articles?: Array<Record<string, string>> };

    await env.DB.prepare(
      `INSERT OR IGNORE INTO sources (id, name, kind, country, lang, feed_url, active)
       VALUES ('gdelt', 'GDELT DOC 2.0', 'aggregator', 'US', 'multi', ?, 1)`,
    )
      .bind(GDELT_ENDPOINT)
      .run();

    for (const item of payload.articles ?? []) {
      const rawUrl = item.url;
      const title = stripHtml(item.title);
      if (!rawUrl || !title) continue;

      const canonicalUrl = canonicalizeUrl(rawUrl);
      const contentHash = await sha256Hex(canonicalUrl);
      const article = {
        id: `art_${contentHash.slice(0, 24)}`,
        sourceId: 'gdelt',
        url: rawUrl,
        canonicalUrl,
        title,
        lang: item.language?.toLowerCase().startsWith('fr') ? 'fr' : (item.language ?? 'unknown'),
        publishedAt: parseGdeltDate(item.seendate),
        excerpt: truncate(stripHtml(item.title), 300),
        contentHash,
      };

      const inserted = await insertArticle(env, article);
      if (!inserted) continue;
      items += 1;
      try {
        await env.INGEST_QUEUE.send({ kind: 'article', articleId: article.id });
      } catch {
        // best-effort
      }
    }
  } catch (error) {
    errors += 1;
    console.error('gdelt failed', error);
  }

  await finishRun(env, runId, errors > 0 ? 'error' : 'ok', items, errors);
  return { items, errors };
}
