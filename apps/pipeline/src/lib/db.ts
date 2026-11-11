import { monthKey, newId, nowIso } from '@vlf/db';
import type { Env, NormalizedArticle } from '../types';

export async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = String(error);
      if (!message.includes('SQLITE_BUSY') && !message.includes('database is locked')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function insertArticle(env: Env, article: NormalizedArticle): Promise<boolean> {
  const result = await withRetry(() => env.DB.prepare(
    `INSERT OR IGNORE INTO articles
      (id, source_id, url, canonical_url, title, lang, published_at, excerpt, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      article.id,
      article.sourceId,
      article.url,
      article.canonicalUrl,
      article.title,
      article.lang,
      article.publishedAt,
      article.excerpt,
      article.contentHash,
      nowIso(),
    )
    .run());
  return (result.meta.changes ?? 0) > 0;
}

export async function insertSocialPost(
  env: Env,
  post: {
    platform: 'x' | 'bluesky' | 'mastodon' | 'youtube';
    postId: string;
    authorHandle: string;
    text: string;
    createdAt: string;
    url: string;
    likeCount?: number;
    repostCount?: number;
    replyCount?: number;
    lang?: string;
    raw?: unknown;
  },
): Promise<boolean> {
  const result = await withRetry(() => env.DB.prepare(
    `INSERT OR IGNORE INTO social_posts
      (id, platform, post_id, author_handle, text, lang, created_at, like_count, repost_count, reply_count, url, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId('soc'),
      post.platform,
      post.postId,
      post.authorHandle,
      post.text,
      post.lang ?? 'fr',
      post.createdAt,
      post.likeCount ?? 0,
      post.repostCount ?? 0,
      post.replyCount ?? 0,
      post.url,
      post.raw ? JSON.stringify(post.raw) : null,
    )
    .run());
  return (result.meta.changes ?? 0) > 0;
}

export async function startRun(env: Env, connector: string): Promise<string> {
  const id = newId('run');
  await withRetry(() => env.DB.prepare(
    `INSERT INTO ingestion_runs (id, connector, started_at, status, items, errors)
     VALUES (?, ?, ?, 'running', 0, 0)`,
  )
    .bind(id, connector, nowIso())
    .run());
  return id;
}

export async function finishRun(
  env: Env,
  id: string,
  status: 'ok' | 'partial' | 'error',
  items: number,
  errors: number,
  detail?: string,
): Promise<void> {
  await withRetry(() => env.DB.prepare(
    `UPDATE ingestion_runs
     SET finished_at = ?, status = ?, items = ?, errors = ?, detail = ?
     WHERE id = ?`,
  )
    .bind(nowIso(), status, items, errors, detail ?? null, id)
    .run());
}

export async function getXBudget(env: Env): Promise<{ month: string; reads: number; cap: number }> {
  const month = monthKey();
  const cap = Number(env.X_MONTHLY_READ_CAP ?? '4000');
  const row = await env.DB.prepare('SELECT month, reads, cap FROM x_budget WHERE month = ?')
    .bind(month)
    .first<{ month: string; reads: number; cap: number }>();
  if (row) return row;
  await env.DB.prepare(
    'INSERT OR IGNORE INTO x_budget (month, reads, cap, updated_at) VALUES (?, 0, ?, ?)',
  )
    .bind(month, cap, nowIso())
    .run();
  return { month, reads: 0, cap };
}

export async function addXReads(env: Env, count: number): Promise<void> {
  const month = monthKey();
  await withRetry(() =>
    env.DB.prepare('UPDATE x_budget SET reads = reads + ?, updated_at = ? WHERE month = ?')
      .bind(count, nowIso(), month)
      .run(),
  );
}

export async function getArticleById(env: Env, id: string) {
  return env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<{
    id: string;
    title: string;
    excerpt: string | null;
    lang: string;
    source_id: string;
  }>();
}

export async function storeJudgment(
  env: Env,
  judgment: {
    subjectType: 'article' | 'social_post' | 'market' | 'poll_pdf';
    subjectId: string;
    contentHash?: string;
    model: string;
    question: string;
    answerType: 'noul' | 'choice' | 'score';
    value: string;
    probability?: number;
    confidence?: number;
    usage?: unknown;
  },
): Promise<void> {
  await withRetry(() => env.DB.prepare(
    `INSERT OR REPLACE INTO judgments
      (id, subject_type, subject_id, content_hash, model, question, answer_type, value, probability, confidence, usage_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId('jud'),
      judgment.subjectType,
      judgment.subjectId,
      judgment.contentHash ?? null,
      judgment.model,
      judgment.question,
      judgment.answerType,
      judgment.value,
      judgment.probability ?? null,
      judgment.confidence ?? null,
      judgment.usage ? JSON.stringify(judgment.usage) : null,
      nowIso(),
    )
    .run());
}
