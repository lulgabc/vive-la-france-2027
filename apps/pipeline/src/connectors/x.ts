import { X_ACCOUNTS } from '../config/sources';
import { addXReads, finishRun, getXBudget, insertSocialPost, startRun } from '../lib/db';
import type { Env } from '../types';

const X_API = 'https://api.x.com/2';

async function resolveUserId(env: Env, handle: string): Promise<string | null> {
  const cacheKey = `x:uid:${handle.toLowerCase()}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(`${X_API}/users/by/username/${handle}?user.fields=id,name,username`, {
    headers: { authorization: `Bearer ${env.X_BEARER_TOKEN}` },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { data?: { id?: string } };
  const id = payload.data?.id ?? null;
  if (id) await env.CACHE.put(cacheKey, id, { expirationTtl: 60 * 60 * 24 * 30 });
  return id;
}

export async function runX(env: Env): Promise<{ items: number; errors: number; skipped?: boolean }> {
  const runId = await startRun(env, 'x');
  if (!env.X_BEARER_TOKEN) {
    await finishRun(env, runId, 'ok', 0, 0, 'X_BEARER_TOKEN not configured');
    return { items: 0, errors: 0, skipped: true };
  }

  const budget = await getXBudget(env);
  if (budget.reads >= budget.cap) {
    await finishRun(env, runId, 'ok', 0, 0, 'monthly read cap reached');
    return { items: 0, errors: 0, skipped: true };
  }

  let items = 0;
  let errors = 0;
  let reads = 0;

  for (const handle of X_ACCOUNTS) {
    if (budget.reads + reads >= budget.cap) break;
    try {
      const userId = await resolveUserId(env, handle);
      if (!userId) continue;

      const url = new URL(`${X_API}/users/${userId}/tweets`);
      url.searchParams.set('max_results', '10');
      url.searchParams.set('exclude', 'retweets,replies');
      url.searchParams.set('tweet.fields', 'created_at,public_metrics,lang,author_id');

      const response = await fetch(url.toString(), {
        headers: { authorization: `Bearer ${env.X_BEARER_TOKEN}` },
      });
      if (!response.ok) {
        errors += 1;
        continue;
      }

      const payload = (await response.json()) as {
        data?: Array<{
          id: string;
          text: string;
          created_at?: string;
          lang?: string;
          public_metrics?: {
            like_count?: number;
            retweet_count?: number;
            reply_count?: number;
          };
        }>;
      };

      const posts = payload.data ?? [];
      reads += posts.length;

      for (const post of posts) {
        const inserted = await insertSocialPost(env, {
          platform: 'x',
          postId: post.id,
          authorHandle: handle,
          text: post.text,
          lang: post.lang ?? 'fr',
          createdAt: post.created_at ?? new Date().toISOString(),
          url: `https://x.com/${handle}/status/${post.id}`,
          likeCount: post.public_metrics?.like_count ?? 0,
          repostCount: post.public_metrics?.retweet_count ?? 0,
          replyCount: post.public_metrics?.reply_count ?? 0,
          raw: post,
        });
        if (inserted) {
          items += 1;
          try {
            await env.INGEST_QUEUE.send({ kind: 'social', platform: 'x', postId: post.id });
          } catch {
            // best-effort
          }
        }
      }
    } catch (error) {
      errors += 1;
      console.error(`x ${handle} failed`, error);
    }
  }

  if (reads > 0) await addXReads(env, reads);
  await finishRun(env, runId, errors > 0 ? 'partial' : 'ok', items, errors, `reads=${reads}`);
  return { items, errors };
}
