import { stripHtml, truncate } from '../lib/hash';
import type { Env } from '../types';

export async function cleanArticles(env: Env, limit = 1000): Promise<number> {
  const { results } = await env.DB.prepare(
    'SELECT id, title, excerpt FROM articles ORDER BY created_at DESC LIMIT ?',
  )
    .bind(limit)
    .all<{ id: string; title: string; excerpt: string | null }>();

  let updated = 0;
  for (const article of results) {
    const title = stripHtml(article.title);
    const excerpt = truncate(stripHtml(article.excerpt ?? ''), 600);
    if (title === article.title && excerpt === (article.excerpt ?? '')) continue;
    await env.DB.prepare('UPDATE articles SET title = ?, excerpt = ? WHERE id = ?')
      .bind(title, excerpt, article.id)
      .run();
    updated += 1;
  }
  return updated;
}
