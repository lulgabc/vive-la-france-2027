import { candidates, demo, results2022 } from '@vlf/domain';

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function jsonResponse(
  data: unknown,
  init: ResponseInit = {},
  request?: Request,
): Response {
  const body = JSON.stringify(data);
  const etag = `W/"${stableHash(body)}"`;
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, s-maxage=15, stale-while-revalidate=60',
    ...(init.headers ?? {}),
    etag,
  };
  if (request?.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { ...init, headers });
}

function seedCandidates() {
  return {
    source: 'seed',
    as_of: demo.as_of,
    demo: true,
    data: candidates.map((candidate) => ({
      ...candidate,
      score: demo.candidates.find((item) => item.candidate_id === candidate.id) ?? null,
    })),
  };
}

function seedScores() {
  return { source: 'seed', as_of: demo.as_of, demo: true, data: demo.candidates };
}

export async function readCandidates(db?: D1Database) {
  if (!db) return seedCandidates();

  try {
    const [{ results: rows }, { results: scores }] = await Promise.all([
      db.prepare('SELECT * FROM candidates ORDER BY full_name').all(),
      db
        .prepare(
          'SELECT * FROM scores WHERE as_of = (SELECT MAX(as_of) FROM scores) ORDER BY composite DESC',
        )
        .all(),
    ]);

    const isDemo = scores.some((score: any) => {
      try {
        return JSON.parse(score.components_json ?? '{}').demo === true;
      } catch {
        return false;
      }
    });

    return {
      source: 'd1',
      as_of: (scores[0] as any)?.as_of ?? null,
      demo: isDemo,
      data: rows.map((row: any) => ({
        ...row,
        score: scores.find((score: any) => score.entity_id === row.id) ?? null,
      })),
    };
  } catch (error) {
    console.error('D1 candidates unavailable, falling back to seed', error);
    return seedCandidates();
  }
}

export async function readScores(db?: D1Database) {
  if (!db) return seedScores();

  try {
    const { results } = await db
      .prepare(
        'SELECT * FROM scores WHERE as_of = (SELECT MAX(as_of) FROM scores) ORDER BY composite DESC',
      )
      .all();
    const isDemo = results.some((score: any) => {
      try {
        return JSON.parse(score.components_json ?? '{}').demo === true;
      } catch {
        return false;
      }
    });
    return { source: 'd1', as_of: (results[0] as any)?.as_of ?? null, demo: isDemo, data: results };
  } catch (error) {
    console.error('D1 scores unavailable, falling back to seed', error);
    return seedScores();
  }
}

export function readMap() {
  return {
    source: results2022.source,
    as_of: results2022.as_of,
    election: results2022.election,
    data: results2022.departments,
  };
}

export interface FeedParams {
  source?: string;
  topic?: string;
  q?: string;
  limit?: number;
  offset?: number;
  electionOnly?: boolean;
}

export async function readFeed(db: D1Database | undefined, params: FeedParams = {}) {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const offset = Math.max(params.offset ?? 0, 0);
  if (!db) {
    return { source: 'seed', total: 0, limit, offset, data: [], note: 'D1 unavailable' };
  }

  const where: string[] = [];
  const bindings: unknown[] = [];
  if (params.source) {
    where.push('a.source_id = ?');
    bindings.push(params.source);
  }
  if (params.topic) {
    where.push(
      `(SELECT j.value FROM judgments j
        WHERE j.subject_type = 'article' AND j.subject_id = a.id AND j.question = 'topic'
        ORDER BY j.created_at DESC LIMIT 1) = ?`,
    );
    bindings.push(params.topic);
  }
  if (params.q) {
    where.push('(a.title LIKE ? OR a.excerpt LIKE ?)');
    bindings.push(`%${params.q}%`, `%${params.q}%`);
  }
  if (params.electionOnly !== false) {
    where.push(
      `(SELECT je.value FROM judgments je
        WHERE je.subject_type = 'article' AND je.subject_id = a.id
          AND je.question = 'election_related'
        ORDER BY je.created_at DESC LIMIT 1) = 'true'`,
    );
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const count = await db
      .prepare(`SELECT COUNT(*) AS n FROM articles a ${whereSql}`)
      .bind(...bindings)
      .first<{ n: number }>();

    const { results } = await db
      .prepare(
        `SELECT a.id, a.title, a.url, a.canonical_url, a.published_at, a.excerpt, a.lang,
                s.name AS source_name,
                (SELECT j.value FROM judgments j
                  WHERE j.subject_type = 'article' AND j.subject_id = a.id AND j.question = 'topic'
                  ORDER BY j.created_at DESC LIMIT 1) AS topic,
                (SELECT j.confidence FROM judgments j
                  WHERE j.subject_type = 'article' AND j.subject_id = a.id AND j.question = 'topic'
                  ORDER BY j.created_at DESC LIMIT 1) AS topic_confidence
         FROM articles a
         JOIN sources s ON s.id = a.source_id
         ${whereSql}
         ORDER BY COALESCE(a.published_at, a.created_at) DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, limit, offset)
      .all();

    return { source: 'd1', total: count?.n ?? 0, limit, offset, data: results, note: null };
  } catch (error) {
    console.error('D1 feed unavailable', error);
    return { source: 'seed', total: 0, limit, offset, data: [], note: 'D1 unavailable' };
  }
}

export async function readScoreHistory(db: D1Database | undefined, days = 30) {
  if (!db) return { source: 'seed', data: [] };
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const { results } = await db
      .prepare(
        `SELECT entity_id, as_of, composite FROM score_history
         WHERE as_of >= ?
           AND components_json LIKE '%"mode":"poll+market-historical"%'
         ORDER BY as_of ASC`,
      )
      .bind(since)
      .all<{ entity_id: string; as_of: string; composite: number }>();
    return { source: 'd1', data: results };
  } catch (error) {
    console.error('D1 score history unavailable', error);
    return { source: 'seed', data: [] };
  }
}

export async function readPolls(db: D1Database | undefined) {
  if (!db) return { source: 'seed', data: [] };
  try {
    const { results } = await db
      .prepare(
        `SELECT p.id, p.fieldwork_start, p.fieldwork_end, p.sample_size, p.source_url, p.published_at,
                ps.name AS pollster,
                c1.name_fr AS top_fr, c1.name_en AS top_en, c1.name_zh AS top_zh, r1.pct AS top_pct,
                c2.name_fr AS second_fr, c2.name_en AS second_en, c2.name_zh AS second_zh, r2.pct AS second_pct
         FROM polls p
         JOIN pollsters ps ON ps.id = p.pollster_id
         JOIN poll_results r1 ON r1.poll_id = p.id AND r1.rank = 1
         LEFT JOIN candidates c1 ON c1.id = r1.candidate_id
         LEFT JOIN poll_results r2 ON r2.poll_id = p.id AND r2.rank = 2
         LEFT JOIN candidates c2 ON c2.id = r2.candidate_id
         WHERE p.status = 'published'
         ORDER BY p.fieldwork_end DESC
         LIMIT 60`,
      )
      .all();
    return { source: 'd1', data: results };
  } catch (error) {
    console.error('D1 polls unavailable', error);
    return { source: 'seed', data: [] };
  }
}

export async function readPollAverages(db: D1Database | undefined) {
  if (!db) return { source: 'seed', as_of: null, data: [] };
  try {
    const { results } = await db
      .prepare(
        `SELECT as_of, candidate_id, avg, polls, last_poll_at
         FROM poll_averages
         WHERE as_of = (SELECT MAX(as_of) FROM poll_averages)
         ORDER BY avg DESC`,
      )
      .all<{
        as_of: string;
        candidate_id: string;
        avg: number;
        polls: number;
        last_poll_at: string | null;
      }>();
    return { source: 'd1', as_of: results[0]?.as_of ?? null, data: results };
  } catch (error) {
    console.error('D1 poll averages unavailable', error);
    return { source: 'seed', as_of: null, data: [] };
  }
}

export async function readMarkets(db: D1Database | undefined) {
  if (!db) return { source: 'seed', data: [], note: 'D1 unavailable' };
  try {
    const [{ results }, { results: snapshots }] = await Promise.all([
      db
        .prepare(
          `SELECT m.id, m.platform, m.market_key, m.question, m.resolution_date, m.liquidity, m.source_url,
                  s.implied_prob, s.ts
           FROM markets m
           LEFT JOIN market_snapshots s
             ON s.id = (SELECT id FROM market_snapshots WHERE market_id = m.id ORDER BY ts DESC LIMIT 1)
           ORDER BY s.implied_prob DESC, m.question
           LIMIT 50`,
        )
        .all(),
      db
        .prepare(
          `SELECT market_id, ts, implied_prob FROM market_snapshots
           ORDER BY ts ASC`,
        )
        .all<{ market_id: string; ts: string; implied_prob: number }>(),
    ]);

    const history = new Map<string, Array<{ ts: string; prob: number }>>();
    for (const point of snapshots) {
      const list = history.get(point.market_id) ?? [];
      list.push({ ts: point.ts, prob: point.implied_prob });
      history.set(point.market_id, list);
    }

    const now = Date.now();
    const data = results.map((market: any) => {
      const points = history.get(market.id) ?? [];
      const latest = points.at(-1)?.prob ?? market.implied_prob;
      const change = (days: number) => {
        const cutoff = now - days * 86_400_000;
        const before = points.filter((point) => new Date(point.ts).getTime() <= cutoff).at(-1);
        return before && typeof latest === 'number' ? latest - before.prob : null;
      };
      return {
        ...market,
        history: points,
        change_7d: change(7),
        change_30d: change(30),
      };
    });

    const platforms = Array.from(new Set(data.map((market: any) => market.platform))).sort();
    return { source: 'd1', data, platforms, note: null };
  } catch (error) {
    console.error('D1 markets unavailable', error);
    return { source: 'seed', data: [], platforms: [], note: 'D1 unavailable' };
  }
}

export async function readSources(db: D1Database | undefined) {
  if (!db) return [];
  try {
    const { results } = await db
      .prepare('SELECT id, name, kind, lang, feed_url FROM sources WHERE active = 1 ORDER BY name')
      .all();
    return results;
  } catch {
    return [];
  }
}

export async function readMomentum(db: D1Database | undefined) {
  if (!db) return { as_of: null, window_days: 7, data: [] };
  try {
    const { results } = await db
      .prepare(
        `SELECT as_of, entity_id, mentions, share
         FROM media_momentum
         WHERE window_days = 7 AND as_of = (SELECT MAX(as_of) FROM media_momentum WHERE window_days = 7)
         ORDER BY mentions DESC LIMIT 12`,
      )
      .all<{ as_of: string; entity_id: string; mentions: number; share: number }>();

    const data = results.map((row) => {
      const candidate = candidates.find((item) => item.id === row.entity_id);
      return {
        ...row,
        name: candidate?.name_fr ?? row.entity_id,
        party_id: candidate?.party_id ?? null,
      };
    });
    return {
      as_of: results[0]?.as_of ?? null,
      window_days: 7,
      data,
    };
  } catch {
    return { as_of: null, window_days: 7, data: [] };
  }
}


export async function readForecastRuns(db: D1Database | undefined, limit = 12) {
  if (!db) return { source: 'seed', data: [] };
  try {
    const { results } = await db
      .prepare(
        `SELECT r.id, r.model_version, r.election_id, r.created_at, r.inputs_hash, r.seed,
                COUNT(o.id) AS outcomes
         FROM forecast_runs r
         LEFT JOIN forecast_outcomes o ON o.run_id = r.id
         GROUP BY r.id
         ORDER BY r.created_at DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all();
    return { source: 'd1', data: results };
  } catch (error) {
    console.error('D1 forecast runs unavailable', error);
    return { source: 'seed', data: [] };
  }
}

export async function readForecastComparison(db: D1Database | undefined) {
  if (!db) return { source: 'seed', runs: [], seats: [] };
  try {
    const [{ results: runs }, { results: seats }] = await Promise.all([
      db
        .prepare(
          `SELECT r.id, r.model_version, r.election_id, r.created_at, r.inputs_hash, r.seed,
                  COUNT(o.id) AS outcomes
           FROM forecast_runs r
           LEFT JOIN forecast_outcomes o ON o.run_id = r.id
           GROUP BY r.id
           ORDER BY r.created_at ASC
           LIMIT 100`,
        )
        .all(),
      db
        .prepare(
          `SELECT r.id, r.model_version, r.created_at, r.seed,
                  o.label AS bloc, o.value AS seats, o.p10, o.p90
           FROM forecast_runs r
           JOIN forecast_outcomes o ON o.run_id = r.id
           WHERE o.metric = 'seats'
           ORDER BY r.created_at ASC`,
        )
        .all(),
    ]);
    return { source: 'd1', runs, seats };
  } catch (error) {
    console.error('D1 forecast comparison unavailable', error);
    return { source: 'seed', runs: [], seats: [] };
  }
}

export async function readDataVersion(db: D1Database | undefined): Promise<string> {
  if (!db) return 'seed';
  try {
    const row = await db
      .prepare(
        `SELECT MAX(ts) AS ts FROM (
           SELECT MAX(created_at) AS ts FROM articles
           UNION ALL SELECT MAX(created_at) FROM social_posts
           UNION ALL SELECT MAX(as_of) FROM scores
           UNION ALL SELECT MAX(ts) FROM market_snapshots
           UNION ALL SELECT MAX(created_at) FROM forecast_runs
         )`,
      )
      .first<{ ts: string | null }>();
    return row?.ts ?? 'empty';
  } catch (error) {
    console.error('D1 data version unavailable', error);
    return 'error';
  }
}

export async function readConnectorStatus(db: D1Database | undefined) {
  if (!db) return { source: 'seed', data: [] };
  try {
    const { results } = await db
      .prepare(
        `SELECT connector, MAX(finished_at) AS last_finished,
                (SELECT status FROM ingestion_runs r2 WHERE r2.connector = r1.connector ORDER BY started_at DESC LIMIT 1) AS last_status,
                (SELECT items FROM ingestion_runs r2 WHERE r2.connector = r1.connector ORDER BY started_at DESC LIMIT 1) AS last_items,
                (SELECT errors FROM ingestion_runs r2 WHERE r2.connector = r1.connector ORDER BY started_at DESC LIMIT 1) AS last_errors,
                (SELECT detail FROM ingestion_runs r2 WHERE r2.connector = r1.connector ORDER BY started_at DESC LIMIT 1) AS last_detail
         FROM ingestion_runs r1
         GROUP BY connector
         ORDER BY last_finished DESC`,
      )
      .all();
    return { source: 'd1', data: results };
  } catch (error) {
    console.error('D1 connector status unavailable', error);
    return { source: 'seed', data: [] };
  }
}

export async function readLatestUpdate(db: D1Database | undefined): Promise<string> {
  if (!db) return '';
  try {
    const row = await db
      .prepare(
        `SELECT MAX(ts) AS ts FROM (
           SELECT MAX(created_at) AS ts FROM articles
           UNION ALL SELECT MAX(created_at) FROM social_posts
           UNION ALL SELECT MAX(ts) FROM market_snapshots
           UNION ALL SELECT MAX(created_at) FROM forecast_runs
           UNION ALL SELECT MAX(published_at) AS ts FROM polls
         )`,
      )
      .first<{ ts: string | null }>();
    return row?.ts ?? '';
  } catch (error) {
    console.error('D1 latest update unavailable', error);
    return '';
  }
}
