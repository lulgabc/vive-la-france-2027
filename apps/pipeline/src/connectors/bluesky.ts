import { ALIASES } from '../scores/momentum';
import { finishRun, insertSocialPost, startRun } from '../lib/db';
import { normalize } from '../judge/rules';
import type { Env } from '../types';
import { publishLive } from '../live/publish';

const SEARCH = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts';

const QUERIES = [
  'présidentielle 2027',
  'élection présidentielle 2027',
  'campagne 2027 France',
  'Marine Le Pen',
  'Jean-Luc Mélenchon',
  'Gabriel Attal',
  'Édouard Philippe',
  'Raphaël Glucksmann',
  'Bruno Retailleau',
  'Marine Tondelier',
  'Éric Zemmour',
  'Fabien Roussel',
  'Nicolas Dupont-Aignan',
  'François Ruffin',
  'François Hollande',
];

const FRENCH_HINTS = [
  ' le ', ' la ', ' les ', ' des ', ' une ', ' un ', ' et ', ' pour ', ' avec ',
  ' dans ', ' sur ', ' est ', ' sont ', ' cette ', ' nous ', ' vous ', ' ils ',
  ' elle ', ' au ', ' aux ', ' du ', ' de ', ' que ', ' qui ', ' pas ',
];

function looksFrench(text: string): boolean {
  const lower = ` ${text.toLowerCase()} `;
  const hits = FRENCH_HINTS.filter((hint) => lower.includes(hint)).length;
  return /[àâçéèêëîïôûùüÿœæ]/i.test(text) || hits >= 2;
}

function matchedCandidates(text: string): string[] {
  const normalized = normalize(text);
  const ids: string[] = [];
  for (const [candidateId, aliases] of Object.entries(ALIASES)) {
    if (aliases.some((alias) => normalized.includes(normalize(alias)))) ids.push(candidateId);
  }
  return ids;
}

export async function runBluesky(env: Env): Promise<{ items: number; errors: number; skipped?: boolean }> {
  const runId = await startRun(env, 'bluesky');
  let items = 0;
  let errors = 0;
  const seen = new Set<string>();

  for (const query of QUERIES) {
    try {
      const url = new URL(SEARCH);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', '50');
      url.searchParams.set('sort', 'latest');

      const response = await fetch(url.toString(), {
        headers: {
          accept: 'application/json',
          'user-agent': 'ViveLaFrance2027Bot/0.1 (+https://vivelafrance2027.example)',
        },
        signal: AbortSignal.timeout(20_000),
        cf: { cacheTtl: 180 },
      } as any);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = (await response.json()) as {
        posts?: Array<{
          uri: string;
          cid: string;
          indexedAt?: string;
          author?: { handle?: string; displayName?: string };
          record?: { text?: string; createdAt?: string; langs?: string[] };
          likeCount?: number;
          repostCount?: number;
          replyCount?: number;
          lang?: string;
        }>;
      };

      for (const post of payload.posts ?? []) {
        if (seen.has(post.uri)) continue;
        seen.add(post.uri);
        const text = (post.record?.text ?? '').trim();
        if (!text || text.length < 20) continue;
        const langs = post.record?.langs ?? [];
        if (!langs.includes('fr') && !looksFrench(text)) continue;

        const candidateIds = matchedCandidates(text);
        const rkey = post.uri.split('/').pop() ?? post.cid;
        const handle = post.author?.handle ?? 'unknown';
        const inserted = await insertSocialPost(env, {
          platform: 'bluesky',
          postId: post.uri,
          authorHandle: handle,
          text: text.slice(0, 1200),
          lang: 'fr',
          createdAt: post.record?.createdAt ?? post.indexedAt ?? new Date().toISOString(),
          url: `https://bsky.app/profile/${handle}/post/${rkey}`,
          likeCount: post.likeCount ?? 0,
          repostCount: post.repostCount ?? 0,
          replyCount: post.replyCount ?? 0,
          raw: { ...post, candidate_ids: candidateIds },
        });
        if (inserted) items += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (error) {
      errors += 1;
      console.error(`bluesky query failed: ${query}`, error);
    }
  }

  if (items > 0) await publishLive(env, { type: 'social', platform: 'bluesky', count: items });
  await finishRun(env, runId, errors > 0 ? 'partial' : 'ok', items, errors, `${QUERIES.length} queries`);
  return { items, errors };
}
