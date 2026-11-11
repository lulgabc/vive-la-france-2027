import { newId, nowIso } from '@vlf/db';
import { finishRun, startRun } from '../lib/db';
import type { Env } from '../types';
import endorsementsData from '../config/endorsements-2027.json';

interface EndorsementItem {
  candidate_id: string;
  endorser_name: string;
  endorser_type: string;
  office?: string;
  party_id?: string;
  weight: number;
  announced_at?: string;
  source_name?: string;
  source_url: string;
  quote?: string;
}

export async function runEndorsements(env: Env): Promise<{ items: number; errors: number }> {
  const runId = await startRun(env, 'endorsements');
  let items = 0;
  let errors = 0;

  for (const item of endorsementsData.items as EndorsementItem[]) {
    try {
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO endorsements
          (id, candidate_id, endorser_name, endorser_type, office, party_id, weight,
           announced_at, source_url, source_name, quote, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          newId('end'),
          item.candidate_id,
          item.endorser_name,
          item.endorser_type,
          item.office ?? null,
          item.party_id ?? null,
          item.weight,
          item.announced_at ?? null,
          item.source_url,
          item.source_name ?? null,
          item.quote ?? null,
          nowIso(),
        )
        .run();
      if ((result.meta.changes ?? 0) > 0) items += 1;
    } catch (error) {
      errors += 1;
      console.error(`endorsement failed: ${item.candidate_id}/${item.endorser_name}`, error);
    }
  }

  await finishRun(env, runId, errors > 0 ? 'partial' : 'ok', items, errors);
  return { items, errors };
}
