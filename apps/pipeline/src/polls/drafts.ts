import { candidates } from '@vlf/domain';
import { newId, nowIso } from '@vlf/db';
import { normalize } from '../judge/rules';
import type { Env } from '../types';

interface ParsedResult {
  name: string;
  pct: number;
  candidate_id?: string;
}

interface ParsedDraft {
  source_url: string;
  pollster: string | null;
  sponsor: string | null;
  fieldwork_start: string | null;
  fieldwork_end: string | null;
  sample_size: number | null;
  population: string | null;
  methodology: string | null;
  notice_number: string | null;
  commission_notice_url: string | null;
  confidence: number;
  warnings: string[];
  results: ParsedResult[];
  raw_text?: string;
}

async function checksum(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function matchCandidate(name: string): string | null {
  const target = normalize(name);
  for (const candidate of candidates) {
    const names = [candidate.full_name, candidate.name_fr, candidate.name_en];
    if (names.some((value) => normalize(value) === target)) return candidate.id;
  }
  return null;
}

async function resolvePollster(env: Env, name: string | null): Promise<string | null> {
  if (!name) return null;
  const target = normalize(name);
  const { results } = await env.DB.prepare('SELECT id, name FROM pollsters').all<{
    id: string;
    name: string;
  }>();
  const exact = results.find((row) => normalize(row.name) === target);
  if (exact) return exact.id;
  const partial = results.find(
    (row) => target.includes(normalize(row.name)) || normalize(row.name).includes(target),
  );
  return partial?.id ?? null;
}

export async function parsePollDraft(env: Env, url: string): Promise<ParsedDraft> {
  const base = env.COMPUTE_URL ?? 'http://127.0.0.1:8000';
  const response = await fetch(`${base.replace(/\/$/, '')}/parse-poll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`compute parser returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as ParsedDraft & { ok?: boolean };
  return {
    ...payload,
    source_url: url,
    commission_notice_url: url,
    results: (payload.results ?? []).map((result) => ({
      ...result,
      candidate_id: matchCandidate(result.name) ?? undefined,
    })),
  };
}

export async function storePollDraft(
  env: Env,
  draft: ParsedDraft,
): Promise<{ id: string; inserted: boolean; warnings: string[] }> {
  const hash = await checksum(
    JSON.stringify({ url: draft.source_url, results: draft.results, end: draft.fieldwork_end }),
  );
  const id = `draft_${hash.slice(0, 20)}`;
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO poll_drafts
      (id, source_url, notice_number, pollster, sponsor, fieldwork_start, fieldwork_end,
       sample_size, population, methodology, commission_notice_url, parsed_json, raw_text,
       confidence, status, created_at, checksum)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(
      id,
      draft.source_url,
      draft.notice_number ?? null,
      draft.pollster ?? null,
      draft.sponsor ?? null,
      draft.fieldwork_start ?? null,
      draft.fieldwork_end ?? null,
      draft.sample_size ?? null,
      draft.population ?? null,
      draft.methodology ?? null,
      draft.commission_notice_url ?? draft.source_url,
      JSON.stringify(draft),
      draft.raw_text ?? null,
      draft.confidence ?? 0,
      nowIso(),
      hash,
    )
    .run();
  return { id, inserted: (result.meta.changes ?? 0) > 0, warnings: draft.warnings ?? [] };
}

export async function listPollDrafts(env: Env, status = 'pending') {
  const { results } = await env.DB.prepare(
    `SELECT id, source_url, notice_number, pollster, sponsor, fieldwork_start, fieldwork_end,
            sample_size, confidence, status, warnings_json, created_at, reviewed_at
     FROM (
       SELECT *, json_extract(parsed_json, '$.warnings') AS warnings_json
       FROM poll_drafts
     )
     WHERE (? = 'all' OR status = ?)
     ORDER BY created_at DESC
     LIMIT 100`,
  )
    .bind(status, status)
    .all();
  return results;
}

export async function getPollDraft(env: Env, id: string) {
  return env.DB.prepare('SELECT * FROM poll_drafts WHERE id = ?').bind(id).first<any>();
}

export async function rejectPollDraft(env: Env, id: string, note: string | null) {
  const result = await env.DB.prepare(
    `UPDATE poll_drafts SET status = 'rejected', review_note = ?, reviewed_at = ?
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(note, nowIso(), id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function approvePollDraft(
  env: Env,
  id: string,
  overrides: { pollster_id?: string; results?: Array<{ name: string; pct: number; candidate_id?: string }> } = {},
): Promise<{ ok: boolean; pollId?: string; error?: string; warnings?: string[] }> {
  const draft = await getPollDraft(env, id);
  if (!draft) return { ok: false, error: 'draft not found' };
  if (draft.status !== 'pending') return { ok: false, error: `draft is ${draft.status}` };

  const parsed = JSON.parse(draft.parsed_json) as ParsedDraft;
  const results = overrides.results ?? parsed.results;
  const pollsterId = overrides.pollster_id ?? (await resolvePollster(env, parsed.pollster));
  if (!pollsterId) return { ok: false, error: 'pollster could not be resolved; pass pollster_id' };
  if (!parsed.fieldwork_end) return { ok: false, error: 'fieldwork_end is required' };
  if (!results || results.length === 0) return { ok: false, error: 'no results to approve' };

  const warnings: string[] = [];
  const mapped = results.map((result, index) => {
    const candidateId = result.candidate_id ?? matchCandidate(result.name);
    if (!candidateId) warnings.push(`Unknown candidate: ${result.name}`);
    return { ...result, candidate_id: candidateId ?? null, rank: index + 1 };
  });
  if (mapped.every((result) => !result.candidate_id)) {
    return { ok: false, error: 'no candidate could be mapped; fix results before approving' };
  }

  const pollId = `poll_pdf_${id.replace(/^draft_/, '')}`;
  const publishedAt = nowIso();
  const statements = [
    env.DB.prepare(
      `INSERT OR REPLACE INTO polls
        (id, pollster_id, sponsor, fieldwork_start, fieldwork_end, sample_size, population,
         methodology, source_url, commission_notice_url, published_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
    ).bind(
      pollId,
      pollsterId,
      parsed.sponsor ?? null,
      parsed.fieldwork_start ?? parsed.fieldwork_end,
      parsed.fieldwork_end,
      parsed.sample_size ?? 0,
      parsed.population ?? null,
      parsed.methodology ?? null,
      parsed.source_url,
      parsed.commission_notice_url ?? parsed.source_url,
      publishedAt,
    ),
    env.DB.prepare('DELETE FROM poll_results WHERE poll_id = ?').bind(pollId),
  ];

  for (const result of mapped) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO poll_results (id, poll_id, candidate_id, party_id, pct, rank)
         VALUES (?, ?, ?, NULL, ?, ?)`,
      ).bind(newId('pr'), pollId, result.candidate_id, result.pct, result.rank),
    );
  }

  statements.push(
    env.DB.prepare(
      `UPDATE poll_drafts SET status = 'approved', review_note = ?, reviewed_at = ?
       WHERE id = ?`,
    ).bind(warnings.length > 0 ? warnings.join(' | ') : null, nowIso(), id),
  );

  await env.DB.batch(statements);
  return { ok: true, pollId, warnings };
}
