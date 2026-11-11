import { finishRun, insertSocialPost, startRun } from '../lib/db';
import { parseDate, stripHtml, truncate } from '../lib/hash';
import type { Env } from '../types';
import { publishLive } from '../live/publish';

const INSTANCES = ['mastodon.social', 'mamot.fr', 'piaille.fr', 'framapiaf.org'];
const TAGS = ['presidentielle2027', 'election2027', 'politique'];

export async function runMastodon(env: Env): Promise<{ items: number; errors: number }> {
  const runId = await startRun(env, 'mastodon');
  let items = 0;
  let errors = 0;
  const seen = new Set<string>();

  for (const instance of INSTANCES) {
    for (const tag of TAGS) {
      try {
        const url = `https://${instance}/api/v1/timelines/tag/${tag}?limit=20&local=false`;
        const response = await fetch(url, {
          headers: { accept: 'application/json', 'user-agent': 'ViveLaFrance2027Bot/0.1' },
          signal: AbortSignal.timeout(15_000),
          cf: { cacheTtl: 300 },
        } as any);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const statuses = (await response.json()) as Array<{
          id: string;
          uri: string;
          url: string;
          created_at: string;
          language?: string;
          content: string;
          reblogs_count?: number;
          favourites_count?: number;
          replies_count?: number;
          account?: { acct?: string; display_name?: string };
          tags?: Array<{ name?: string }>;
        }>;

        for (const status of statuses) {
          if (seen.has(status.uri)) continue;
          seen.add(status.uri);
          if (status.language && status.language !== 'fr') continue;
          const text = truncate(stripHtml(status.content), 1200);
          if (!text) continue;

          const inserted = await insertSocialPost(env, {
            platform: 'mastodon',
            postId: status.uri,
            authorHandle: status.account?.acct ?? instance,
            text,
            lang: status.language ?? 'fr',
            createdAt: parseDate(status.created_at) ?? new Date().toISOString(),
            url: status.url,
            likeCount: status.favourites_count ?? 0,
            repostCount: status.reblogs_count ?? 0,
            replyCount: status.replies_count ?? 0,
            raw: status,
          });
          if (inserted) items += 1;
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      } catch (error) {
        errors += 1;
        console.error(`mastodon ${instance}/${tag} failed`, error);
      }
    }
  }

  if (items > 0) await publishLive(env, { type: 'social', platform: 'mastodon', count: items });
  await finishRun(env, runId, errors > 0 ? 'partial' : 'ok', items, errors);
  return { items, errors };
}
