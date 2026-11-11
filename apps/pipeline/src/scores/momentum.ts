import { candidates, parties } from '@vlf/domain';
import { newId, nowIso } from '@vlf/db';
import { normalize } from '../judge/rules';
import type { Env } from '../types';

export const ALIASES: Record<string, string[]> = {
  'marine-le-pen': ['marine le pen', 'le pen'],
  'jordan-bardella': ['jordan bardella', 'bardella'],
  'jean-luc-melenchon': ['jean luc melenchon', 'melenchon'],
  'gabriel-attal': ['gabriel attal', 'attal'],
  'edouard-philippe': ['edouard philippe', 'philippe'],
  'raphael-glucksmann': ['raphael glucksmann', 'glucksmann'],
  'bruno-retailleau': ['bruno retailleau', 'retailleau'],
  'xavier-bertrand': ['xavier bertrand', 'bertrand'],
  'eric-zemmour': ['eric zemmour', 'zemmour'],
  'nicolas-dupont-aignan': ['nicolas dupont aignan', 'dupont aignan'],
  'francois-bayrou': ['francois bayrou', 'bayrou'],
  'fabien-roussel': ['fabien roussel', 'roussel'],
  'yannick-jadot': ['yannick jadot', 'jadot'],
  'laurent-wauquiez': ['laurent wauquiez', 'wauquiez'],
  'david-lisnard': ['david lisnard', 'lisnard'],
  'marine-tondelier': ['marine tondelier', 'tondelier'],
  'nathalie-arthaud': ['nathalie arthaud', 'arthaud'],
  'dominique-de-villepin': ['dominique de villepin', 'villepin'],
  'francois-hollande': ['francois hollande', 'hollande'],
  'francois-ruffin': ['francois ruffin', 'ruffin'],
  'olivier-faure': ['olivier faure', 'faure'],
  'sarah-knafo': ['sarah knafo', 'knafo'],
};

export async function recomputeMomentum(
  env: Env,
  windowDays = 7,
): Promise<{ articles: number; candidates: number }> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT title, excerpt FROM articles WHERE published_at >= ? ORDER BY published_at DESC LIMIT 1000`,
  )
    .bind(since)
    .all<{ title: string; excerpt: string | null }>();

  const corpus = results.map((article) => normalize(`${article.title} ${article.excerpt ?? ''}`));
  const counts = new Map<string, number>();
  let total = 0;

  for (const candidate of candidates) {
    const aliases = ALIASES[candidate.id] ?? [normalize(candidate.full_name)];
    const mentions = corpus.reduce(
      (sum, text) => sum + (aliases.some((alias) => text.includes(normalize(alias))) ? 1 : 0),
      0,
    );
    counts.set(candidate.id, mentions);
    total += mentions;
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const statements = candidates.map((candidate) => {
    const mentions = counts.get(candidate.id) ?? 0;
    const share = total > 0 ? mentions / total : 0;
    return env.DB.prepare(
      `INSERT OR REPLACE INTO media_momentum
        (id, entity_id, entity_type, as_of, window_days, mentions, share, created_at)
       VALUES (?, ?, 'candidate', ?, ?, ?, ?, ?)`,
    ).bind(
      newId('mom'),
      candidate.id,
      asOf,
      windowDays,
      mentions,
      share,
      nowIso(),
    );
  });

  if (statements.length > 0) await env.DB.batch(statements);
  return { articles: results.length, candidates: candidates.length };
}

export function partyName(partyId: string): string {
  return parties.find((party) => party.id === partyId)?.short_name ?? partyId;
}
