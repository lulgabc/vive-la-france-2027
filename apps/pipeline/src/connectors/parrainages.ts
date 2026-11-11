import { parrainages2022 } from '@vlf/domain';
import { newId, nowIso } from '@vlf/db';
import { finishRun, startRun } from '../lib/db';
import type { Env } from '../types';

export async function runParrainages(env: Env): Promise<{ items: number; errors: number }> {
  const runId = await startRun(env, 'parrainages');
  let items = 0;
  let errors = 0;

  for (const item of parrainages2022.candidates) {
    try {
      const result = await env.DB.prepare(
        `INSERT OR REPLACE INTO parrainage_baseline
          (id, cycle, candidate_name, candidate_id, bloc, total, departments, top_office,
           office_counts_json, source_url, as_of, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          `parr_${parrainages2022.cycle}_${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          parrainages2022.cycle,
          item.name,
          item.candidate_id,
          item.bloc,
          item.total,
          item.departments,
          item.top_office,
          JSON.stringify(item.office_counts),
          parrainages2022.source_url,
          parrainages2022.as_of,
          nowIso(),
        )
        .run();
      if ((result.meta.changes ?? 0) > 0) items += 1;
    } catch (error) {
      errors += 1;
      console.error(`parrainage failed: ${item.name}`, error);
    }
  }

  await finishRun(env, runId, errors > 0 ? 'partial' : 'ok', items, errors);
  return { items, errors };
}

/**
 * The Conseil constitutionnel publishes official parrainages during the
 * campaign. 2027 data is not available yet; this check lets the daily cron
 * notice the dataset as soon as it appears, without inventing data.
 */
export async function checkParrainages2027(): Promise<{
  available: boolean;
  checked_at: string;
  dataset_id?: string;
  title?: string;
  resources?: Array<{ title?: string; format?: string; url?: string }>;
  note: string;
}> {
  const checkedAt = new Date().toISOString();
  try {
    const url = new URL('https://www.data.gouv.fr/api/1/datasets/');
    url.searchParams.set('q', 'parrainages candidats présidentielle 2027');
    url.searchParams.set('page_size', '10');
    const response = await fetch(url.toString(), {
      headers: { accept: 'application/json', 'user-agent': 'ViveLaFrance2027Bot/0.1' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      data?: Array<{
        id: string;
        title: string;
        organization?: { name?: string } | null;
        resources?: Array<{ title?: string; format?: string; url?: string }>;
      }>;
    };
    const dataset = (payload.data ?? []).find(
      (item) =>
        /2027/.test(item.title) &&
        /parrainage/i.test(item.title) &&
        /conseil constitutionnel/i.test(item.organization?.name ?? ''),
    );
    if (!dataset) {
      return {
        available: false,
        checked_at: checkedAt,
        note: 'No official Conseil constitutionnel 2027 parrainage dataset found yet.',
      };
    }
    return {
      available: true,
      checked_at: checkedAt,
      dataset_id: dataset.id,
      title: dataset.title,
      resources: (dataset.resources ?? []).slice(0, 8).map((resource) => ({
        title: resource.title,
        format: resource.format,
        url: resource.url,
      })),
      note: 'Official 2027 parrainage dataset found. Import it as cycle 2027; scores automatically use the highest cycle.',
    };
  } catch (error) {
    return {
      available: false,
      checked_at: checkedAt,
      note: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
