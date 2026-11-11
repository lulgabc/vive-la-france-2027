import { candidates, legislative2022 } from '@vlf/domain';
import { newId } from '@vlf/db';
import { normalize } from '../judge/rules';
import type { Env } from '../types';
import { publishLive } from '../live/publish';
import { ALIASES } from './momentum';

const PARTY_BLOC: Record<string, string> = {
  rn: 'rn',
  lfi: 'left',
  ps: 'left',
  pcf: 'left',
  eelv: 'left',
  lo: 'left',
  renaissance: 'center',
  horizons: 'center',
  modem: 'center',
  lr: 'right',
  'nous-france': 'right',
  reconquete: 'rec',
  dlf: 'other',
  divers: 'other',
};

const WEIGHTS = { poll: 40, market: 20, media: 15, social: 10, elite: 15 } as const;

export async function computeScores(env: Env): Promise<{ candidates: number }> {
  const socialSince = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [pollRows, mediaRows, marketRows, socialRows, endorsementRows, parrainageRows] = await Promise.all([
    env.DB.prepare(
      `SELECT candidate_id, avg, polls FROM poll_averages
       WHERE as_of = (SELECT MAX(as_of) FROM poll_averages)`,
    ).all<{ candidate_id: string; avg: number; polls: number }>(),
    env.DB.prepare(
      `SELECT entity_id, mentions, share FROM media_momentum
       WHERE window_days = 7 AND as_of = (SELECT MAX(as_of) FROM media_momentum WHERE window_days = 7)`,
    ).all<{ entity_id: string; mentions: number; share: number }>(),
    env.DB.prepare(
      `SELECT m.candidate_id, s.implied_prob
       FROM markets m
       JOIN market_snapshots s ON s.market_id = m.id
       WHERE m.platform = 'polymarket'
         AND m.candidate_id IS NOT NULL
         AND m.market_key LIKE '%:victoire:%'
         AND s.ts = (SELECT MAX(ts) FROM market_snapshots WHERE market_id = m.id)`,
    ).all<{ candidate_id: string; implied_prob: number }>(),
    env.DB.prepare(
      `SELECT text FROM social_posts WHERE created_at >= ? ORDER BY created_at DESC LIMIT 5000`,
    )
      .bind(socialSince)
      .all<{ text: string }>(),
    env.DB.prepare(
      `SELECT candidate_id, SUM(weight) AS weight, COUNT(*) AS n
       FROM endorsements GROUP BY candidate_id`,
    ).all<{ candidate_id: string; weight: number; n: number }>(),
    env.DB.prepare(
      `SELECT candidate_id, bloc, total, cycle FROM parrainage_baseline
       WHERE cycle = (SELECT MAX(cycle) FROM parrainage_baseline)`,
    ).all<{ candidate_id: string | null; bloc: string; total: number; cycle: number }>(),
  ]);

  const pollMap = new Map(pollRows.results.map((row) => [row.candidate_id, row]));
  const mediaMap = new Map(mediaRows.results.map((row) => [row.entity_id, row]));
  const marketMap = new Map(marketRows.results.map((row) => [row.candidate_id, row.implied_prob]));
  const endorsementMap = new Map(
    endorsementRows.results.map((row) => [row.candidate_id, { weight: row.weight, n: row.n }]),
  );
  const maxPoll = Math.max(1, ...pollRows.results.map((row) => row.avg));
  const maxMedia = Math.max(1, ...mediaRows.results.map((row) => row.mentions));

  const socialTexts = socialRows.results.map((row) => normalize(row.text));
  const socialCounts = new Map<string, number>();
  let totalSocialMentions = 0;
  for (const candidate of candidates) {
    const aliases = ALIASES[candidate.id] ?? [normalize(candidate.full_name)];
    const mentions = socialTexts.reduce(
      (sum, text) => sum + (aliases.some((alias) => text.includes(normalize(alias))) ? 1 : 0),
      0,
    );
    socialCounts.set(candidate.id, mentions);
    totalSocialMentions += mentions;
  }
  const maxSocial = Math.max(1, ...socialCounts.values());
  const socialAvailable = socialRows.results.length > 0 && totalSocialMentions > 0;

  const seats = legislative2022.national.seats;
  const maxSeats = Math.max(1, ...Object.values(seats));

  const parrainageCycle = parrainageRows.results[0]?.cycle ?? 2022;
  const parrainageByCandidate = new Map<string, number>();
  const parrainageByBloc = new Map<string, number>();
  for (const row of parrainageRows.results) {
    parrainageByBloc.set(row.bloc, (parrainageByBloc.get(row.bloc) ?? 0) + row.total);
    if (row.candidate_id) {
      parrainageByCandidate.set(
        row.candidate_id,
        (parrainageByCandidate.get(row.candidate_id) ?? 0) + row.total,
      );
    }
  }
  const blocCandidateCount = new Map<string, number>();
  for (const candidate of candidates) {
    const bloc = PARTY_BLOC[candidate.party_id] ?? 'other';
    blocCandidateCount.set(bloc, (blocCandidateCount.get(bloc) ?? 0) + 1);
  }
  const maxEndorsement = Math.max(1, ...endorsementRows.results.map((row) => row.weight));

  const eliteRaw = new Map<
    string,
    {
      seat: number;
      parrainage: number;
      endorsements: number;
      parrainageTotal: number;
      count: number;
    }
  >();
  let maxElite = 1;
  for (const candidate of candidates) {
    const bloc = PARTY_BLOC[candidate.party_id] ?? 'other';
    const seatNorm = (seats[bloc] ?? 0) / maxSeats;
    const blocShare = 1 / Math.max(1, blocCandidateCount.get(bloc) ?? 1);
    const effectiveParrainage =
      parrainageByCandidate.get(candidate.id) ??
      (parrainageByBloc.get(bloc) ?? 0) * blocShare;
    const endorsement = endorsementMap.get(candidate.id) ?? { weight: 0, n: 0 };
    const raw =
      0.45 * seatNorm +
      0.35 * (effectiveParrainage / Math.max(1, ...parrainageByCandidate.values())) +
      0.2 * (endorsement.weight / maxEndorsement);
    eliteRaw.set(candidate.id, {
      seat: seatNorm,
      parrainage: effectiveParrainage / Math.max(1, ...parrainageByCandidate.values()),
      endorsements: endorsement.weight / maxEndorsement,
      parrainageTotal: effectiveParrainage,
      count: endorsement.n,
    });
    maxElite = Math.max(maxElite, raw);
  }

  const asOf = new Date().toISOString().slice(0, 10);
  await env.DB.prepare('DELETE FROM scores WHERE as_of = ?').bind(asOf).run();

  const statements = [];
  let scored = 0;
  for (const candidate of candidates) {
    const poll = pollMap.get(candidate.id);
    if (!poll) continue;
    const media = mediaMap.get(candidate.id);
    const market = marketMap.get(candidate.id);
    const socialMentions = socialCounts.get(candidate.id) ?? 0;
    const eliteParts = eliteRaw.get(candidate.id) ?? {
      seat: 0,
      parrainage: 0,
      endorsements: 0,
      parrainageTotal: 0,
      count: 0,
    };
    const eliteNorm = Math.min(1, (0.45 * eliteParts.seat + 0.35 * eliteParts.parrainage + 0.2 * eliteParts.endorsements) / maxElite);

    const pollNorm = (poll.avg / maxPoll) * 100;
    const mediaNorm = media ? (media.mentions / maxMedia) * 100 : null;
    const marketNorm = typeof market === 'number' ? market * 100 : null;
    const socialNorm = socialAvailable ? (socialMentions / maxSocial) * 100 : null;

    let weighted = 0;
    let availableWeight = 0;
    if (pollNorm !== null) {
      weighted += WEIGHTS.poll * pollNorm;
      availableWeight += WEIGHTS.poll;
    }
    if (marketNorm !== null) {
      weighted += WEIGHTS.market * marketNorm;
      availableWeight += WEIGHTS.market;
    }
    if (mediaNorm !== null) {
      weighted += WEIGHTS.media * mediaNorm;
      availableWeight += WEIGHTS.media;
    }
    if (socialNorm !== null) {
      weighted += WEIGHTS.social * socialNorm;
      availableWeight += WEIGHTS.social;
    }
    // Elite is always available: every candidate has a parliamentary bloc and/or endorsements.
    weighted += WEIGHTS.elite * eliteNorm * 100;
    availableWeight += WEIGHTS.elite;

    const composite = availableWeight > 0 ? weighted / availableWeight : 0;
    scored += 1;
    const confidence = poll.polls >= 10 ? 'high' : poll.polls >= 5 ? 'medium' : 'low';
    const components = {
      poll: poll.avg,
      market: market ?? null,
      media: media?.share ?? null,
      social: socialAvailable ? socialMentions / totalSocialMentions : null,
      elite: eliteNorm,
      elite_seat: Number(eliteParts.seat.toFixed(3)),
      elite_parrainage: Number(eliteParts.parrainage.toFixed(3)),
      elite_endorsements: Number(eliteParts.endorsements.toFixed(3)),
      elite_parrainage_total: eliteParts.parrainageTotal,
      elite_parrainage_cycle: parrainageCycle,
      elite_endorsement_count: eliteParts.count,
      poll_n: poll.polls,
      media_mentions: media?.mentions ?? 0,
      social_mentions: socialMentions,
      available_weight: availableWeight,
      weights: WEIGHTS,
      mode: 'poll+market+media+social+elite',
      demo: false,
    };

    statements.push(
      env.DB.prepare(
        `INSERT OR REPLACE INTO scores
          (id, entity_id, entity_type, as_of, poll_avg, market_prob, share_of_voice, social_attention,
           stance_balance, composite, components_json, confidence)
         VALUES (?, ?, 'candidate', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        newId('score'),
        candidate.id,
        asOf,
        poll.avg,
        market ?? null,
        media?.share ?? null,
        socialAvailable ? socialMentions / totalSocialMentions : null,
        eliteNorm,
        composite,
        JSON.stringify(components),
        confidence,
      ),
    );
    statements.push(
      env.DB.prepare(
        `INSERT OR REPLACE INTO score_history (id, entity_id, as_of, composite, components_json)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(`hist_${candidate.id}_${asOf}`, candidate.id, asOf, composite, JSON.stringify(components)),
    );
  }

  if (statements.length > 0) await env.DB.batch(statements);
  await publishLive(env, { type: 'scores', candidates: scored });
  return { candidates: scored };
}
