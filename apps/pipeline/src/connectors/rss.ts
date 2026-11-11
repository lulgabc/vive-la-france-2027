import { XMLParser } from 'fast-xml-parser';
import { RSS_SOURCES } from '../config/sources';
import { canonicalizeUrl, parseDate, sha256Hex, stripHtml, truncate } from '../lib/hash';
import { finishRun, insertArticle, startRun } from '../lib/db';
import type { Env } from '../types';
import { publishLive } from '../live/publish';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

function text(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') return String(value['#text'] ?? value.__cdata ?? '');
  return '';
}

function extractLink(item: any): string {
  const link = item.link;
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    const alternate = link.find((entry) => entry?.['@_rel'] === 'alternate') ?? link[0];
    if (typeof alternate === 'string') return alternate;
    return alternate?.['@_href'] ?? '';
  }
  if (link && typeof link === 'object') return link['@_href'] ?? text(link);
  return text(item.guid) || text(item.id);
}

function extractDate(item: any): string | null {
  return parseDate(
    text(item.pubDate) ||
      text(item.published) ||
      text(item.updated) ||
      text(item['dc:date']) ||
      text(item.date),
  );
}

export async function runRss(env: Env): Promise<{ items: number; errors: number }> {
  const runId = await startRun(env, 'rss');
  let items = 0;
  let errors = 0;

  for (const source of RSS_SOURCES) {
    try {
      const response = await fetch(source.url, {
        headers: {
          'user-agent': 'ViveLaFrance2027Bot/0.1 (+https://vive-la-france-2027.workers.dev)',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
        cf: { cacheTtl: 300 },
      } as any);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      const parsed = parser.parse(xml);
      const channel = parsed.rss?.channel ?? parsed.feed ?? parsed;
      const rawItems = channel?.item ?? channel?.entry ?? [];
      const list = Array.isArray(rawItems) ? rawItems : [rawItems];

      await env.DB.prepare(
        `INSERT OR IGNORE INTO sources (id, name, kind, country, lang, feed_url, active)
         VALUES (?, ?, 'media', 'FR', ?, ?, 1)`,
      )
        .bind(source.id, source.name, source.lang, source.url)
        .run();

      for (const item of list.slice(0, 30)) {
        const url = extractLink(item).trim();
        const title = stripHtml(text(item.title));
        if (!url || !title) continue;

        const canonicalUrl = canonicalizeUrl(url);
        const contentHash = await sha256Hex(canonicalUrl);
        const description =
          text(item.description) ||
          text(item.summary) ||
          text(item['content:encoded']) ||
          text(item.content);

        const article = {
          id: `art_${contentHash.slice(0, 24)}`,
          sourceId: source.id,
          url,
          canonicalUrl,
          title,
          lang: source.lang,
          publishedAt: extractDate(item),
          excerpt: truncate(stripHtml(description), 600),
          contentHash,
        };

        const inserted = await insertArticle(env, article);
        if (!inserted) continue;
        items += 1;
        try {
          await env.INGEST_QUEUE.send({ kind: 'article', articleId: article.id });
        } catch {
          // Queue is best-effort; the article is already stored.
        }
      }
    } catch (error) {
      errors += 1;
      console.error(`rss ${source.id} failed`, error);
    }
  }

  if (items > 0) await publishLive(env, { type: 'articles', source: 'rss', count: items });
  await finishRun(env, runId, errors > 0 ? 'partial' : 'ok', items, errors);
  return { items, errors };
}
