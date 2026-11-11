import { newId, nowIso } from '@vlf/db';
import { finishRun, startRun } from '../lib/db';
import type { Env } from '../types';

const SONDAX_CSV = 'https://sondax.fr/donnees/sondages-presidentielle-2027.csv';

const POLLSTERS: Record<string, string> = {
  ifop: 'ifop',
  harris: 'harris',
  ipsos: 'ipsos',
  cluster17: 'cluster17',
  elabe: 'elabe',
  odoxa: 'odoxa',
  opinionway: 'opinionway',
  yougov: 'yougov',
  verian: 'verian',
  bva: 'bva',
  kantar: 'kantar',
};

const CANDIDATES: Record<string, string> = {
  'le-pen': 'marine-le-pen',
  melenchon: 'jean-luc-melenchon',
  philippe: 'edouard-philippe',
  glucksmann: 'raphael-glucksmann',
  attal: 'gabriel-attal',
  bardella: 'jordan-bardella',
  retailleau: 'bruno-retailleau',
  zemmour: 'eric-zemmour',
  'dupont-aignan': 'nicolas-dupont-aignan',
  roussel: 'fabien-roussel',
  lisnard: 'david-lisnard',
  bertrand: 'xavier-bertrand',
  tondelier: 'marine-tondelier',
  arthaud: 'nathalie-arthaud',
  villepin: 'dominique-de-villepin',
  hollande: 'francois-hollande',
  ruffin: 'francois-ruffin',
  faure: 'olivier-faure',
  knafo: 'sarah-knafo',
};

const PARTIES: Record<string, string> = {
  RN: 'rn',
  LFI: 'lfi',
  HOR: 'horizons',
  PP: 'ps',
  RE: 'renaissance',
  LR: 'lr',
  REC: 'reconquete',
  DLF: 'dlf',
  PCF: 'pcf',
  LE: 'eelv',
  LO: 'lo',
  PS: 'ps',
  LFH: 'divers',
  SE: 'divers',
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export async function runSondax(env: Env): Promise<{ polls: number; rows: number; errors: number }> {
  const runId = await startRun(env, 'sondax');
  let polls = 0;
  let rows = 0;
  let errors = 0;

  try {
    const response = await fetch(SONDAX_CSV, {
      headers: { accept: 'text/csv', 'user-agent': 'ViveLaFrance2027Bot/0.1' },
      signal: AbortSignal.timeout(30_000),
      cf: { cacheTtl: 1800 },
    } as any);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    const table = parseCsv(text);
    const header = table[0];
    const records = table.slice(1).map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));

    for (const pollster of Object.values(POLLSTERS)) {
      await env.DB.prepare('INSERT OR IGNORE INTO pollsters (id, name) VALUES (?, ?)')
        .bind(pollster, pollster.charAt(0).toUpperCase() + pollster.slice(1))
        .run();
    }

    const grouped = new Map<string, Record<string, string>[]>();
    for (const record of records) {
      if (record.tour !== '1' || record.configuration_principale !== '1') continue;
      const list = grouped.get(record.sondage_id) ?? [];
      list.push(record);
      grouped.set(record.sondage_id, list);
    }

    for (const [sondageId, recordsForPoll] of grouped) {
      const first = recordsForPoll[0];
      const pollsterId = POLLSTERS[first.institut.toLowerCase()];
      if (!pollsterId) continue;

      const pollId = `poll_${sondageId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      const publishedAt = `${first.terrain_fin}T12:00:00Z`;
      const sourceUrl = first.url_source || `https://sondax.fr/sondages/${sondageId}`;

      await env.DB.prepare(
        `INSERT OR REPLACE INTO polls
          (id, pollster_id, sponsor, fieldwork_start, fieldwork_end, sample_size, population, methodology,
           source_url, pdf_r2_key, commission_notice_url, published_at, status)
         VALUES (?, ?, NULL, ?, ?, ?, 'registered voters', ?, ?, NULL, ?, ?, 'published')`,
      )
        .bind(
          pollId,
          pollsterId,
          first.terrain_debut,
          first.terrain_fin,
          Number(first.echantillon || 0),
          'Sondax / Wikipédia, configuration principale',
          sourceUrl,
          sourceUrl,
          publishedAt,
        )
        .run();

      const sorted = [...recordsForPoll].sort((a, b) => Number(b.score) - Number(a.score));
      for (let index = 0; index < sorted.length; index += 1) {
        const record = sorted[index];
        const candidateId = CANDIDATES[record.candidat_id] ?? null;
        const partyId = PARTIES[record.parti] ?? null;
        const resultId = `res_${sondageId}_${candidateId ?? record.candidat_id}`;
        await env.DB.prepare(
          `INSERT OR REPLACE INTO poll_results (id, poll_id, candidate_id, party_id, pct, rank)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(resultId, pollId, candidateId, partyId, Number(record.score || 0), index + 1)
          .run();
        rows += 1;
      }
      polls += 1;
    }
  } catch (error) {
    errors += 1;
    console.error('sondax failed', error);
  }

  await finishRun(env, runId, errors > 0 ? 'error' : 'ok', polls, errors);
  return { polls, rows, errors };
}
