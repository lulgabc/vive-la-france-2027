import { z } from 'zod';
import candidatesJson from './seed/candidates.json';
import demoJson from './seed/demo-scores.json';
import departmentsJson from './seed/departments.json';
import partiesJson from './seed/parties.json';
import resultsJson from './seed/results-2022-departments.json';
import legislativeJson from './seed/legislative-2022.json';
import results2017Json from './seed/results-2017-departments.json';
import parrainages2022Json from './seed/parrainages-2022.json';
import legislative2024Json from './seed/legislative-2024.json';

export const ELECTION_DATES = {
  firstRound: '2027-04-18',
  secondRound: '2027-05-02',
  legislativeFirstRound: '2027-06-13',
  legislativeSecondRound: '2027-06-20',
} as const;

export const LOCALES = ['fr', 'en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

export const PartySchema = z.object({
  id: z.string(),
  name: z.string(),
  short_name: z.string(),
  color: z.string(),
  spectrum: z.string(),
  created_at: z.string(),
});
export type Party = z.infer<typeof PartySchema>;

export const CandidateSchema = z.object({
  id: z.string(),
  slug: z.string(),
  full_name: z.string(),
  party_id: z.string(),
  status: z.enum(['declared', 'likely', 'potential', 'withdrawn']),
  declared_at: z.string().nullable(),
  birth_year: z.number(),
  color: z.string(),
  avatar: z.string(),
  avatar_credit: z.string().nullable(),
  avatar_source: z.string().nullable(),
  name_fr: z.string(),
  name_en: z.string(),
  name_zh: z.string(),
  bio_fr: z.string(),
  bio_en: z.string(),
  bio_zh: z.string(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const DemoScoreSchema = z.object({
  candidate_id: z.string(),
  poll_avg: z.number(),
  market_prob: z.number(),
  share_of_voice: z.number(),
  social_attention: z.number(),
  elite: z.number(),
  composite: z.number(),
  confidence: z.enum(['low', 'medium', 'high']),
  trend: z.array(z.number()),
});
export type DemoScore = z.infer<typeof DemoScoreSchema>;

export const DemoFileSchema = z.object({
  as_of: z.string(),
  demo: z.boolean(),
  note: z.string(),
  candidates: z.array(DemoScoreSchema),
});
export type DemoFile = z.infer<typeof DemoFileSchema>;

export const DepartmentResultSchema = z.object({
  code: z.string(),
  name: z.string(),
  region: z.string(),
  turnout: z.number(),
  exprimes: z.number(),
  results: z.array(
    z.object({
      candidate: z.string(),
      party: z.string(),
      party_id: z.string(),
      pct: z.number(),
      votes: z.number(),
    }),
  ),
  winner_party: z.string(),
  winner_candidate: z.string(),
  winner_pct: z.number(),
});
export type DepartmentResult = z.infer<typeof DepartmentResultSchema>;

export const ResultsFileSchema = z.object({
  source: z.string(),
  source_url: z.string(),
  election: z.string(),
  as_of: z.string(),
  departments: z.record(z.string(), DepartmentResultSchema),
});
export type ResultsFile = z.infer<typeof ResultsFileSchema>;

export const DepartmentSchema = z.object({
  code: z.string(),
  name: z.string(),
  region: z.string(),
  winner_party: z.string().nullable(),
  winner_candidate: z.string().nullable(),
  winner_pct: z.number().nullable(),
});
export type Department = z.infer<typeof DepartmentSchema>;

export const parties: Party[] = PartySchema.array().parse(partiesJson);
export const candidates: Candidate[] = CandidateSchema.array().parse(candidatesJson);
export const demo: DemoFile = DemoFileSchema.parse(demoJson);
export const results2022: ResultsFile = ResultsFileSchema.parse(resultsJson);
export const departments: Department[] = DepartmentSchema.array().parse(departmentsJson);

export interface LegislativeConstituency {
  code: string;
  name: string;
  department_code: string;
  department_name: string;
  region: string;
  inscrits: number;
  exprimes: number;
  turnout: number | null;
  shares: Record<string, number>;
  winner_bloc: string;
  winner_nuance: string;
  winner_name: string;
  winner_pct: number;
  runoff: null | {
    winner_bloc: string;
    winner_nuance: string;
    winner_name: string;
    winner_pct: number;
    shares: Record<string, number>;
  };
}

export interface LegislativeFile {
  source: string;
  source_url: string;
  election: string;
  as_of: string;
  blocs: string[];
  national: {
    shares: Record<string, number>;
    seats: Record<string, number>;
    total_seats: number;
    total_votes: number;
  };
  constituencies: Record<string, LegislativeConstituency>;
}

export const legislative2022: LegislativeFile = legislativeJson as LegislativeFile;
export const legislative2024: LegislativeFile = legislative2024Json as LegislativeFile;

export interface DepartmentBlocResult {
  code: string;
  name: string;
  region: string;
  turnout: number | null;
  exprimes: number;
  shares: Record<string, number>;
  winner_bloc: string;
  winner_name: string;
  winner_pct: number;
  results: Array<{ name: string; nuance: string; bloc: string; votes: number; pct: number }>;
}

export interface Results2017File {
  source: string;
  source_url: string;
  election: string;
  as_of: string;
  departments: Record<string, DepartmentBlocResult>;
}

export const results2017: Results2017File = results2017Json as Results2017File;

export interface ParrainageBaselineItem {
  name: string;
  candidate_id: string | null;
  bloc: string;
  total: number;
  departments: number;
  top_office: string | null;
  office_counts: Record<string, number>;
}

export interface Parrainages2022File {
  source: string;
  source_url: string;
  as_of: string;
  cycle: number;
  total: number;
  bloc_totals: Record<string, number>;
  candidates: ParrainageBaselineItem[];
}

export const parrainages2022: Parrainages2022File = parrainages2022Json as unknown as Parrainages2022File;

export const TOPICS = [
  { id: 'economy_purchasing_power', fr: 'Économie / pouvoir d’achat', en: 'Economy / purchasing power', zh: '经济 / 购买力' },
  { id: 'immigration_security', fr: 'Immigration / sécurité', en: 'Immigration / security', zh: '移民 / 安全' },
  { id: 'pensions_social', fr: 'Retraites / social', en: 'Pensions / social', zh: '退休 / 社会' },
  { id: 'health', fr: 'Santé', en: 'Health', zh: '医疗' },
  { id: 'education', fr: 'Éducation', en: 'Education', zh: '教育' },
  { id: 'climate_energy', fr: 'Climat / énergie', en: 'Climate / energy', zh: '气候 / 能源' },
  { id: 'europe_foreign', fr: 'Europe / international', en: 'Europe / foreign affairs', zh: '欧洲 / 外交' },
  { id: 'institutions_democracy', fr: 'Institutions / démocratie', en: 'Institutions / democracy', zh: '制度 / 民主' },
  { id: 'justice', fr: 'Justice', en: 'Justice', zh: '司法' },
  { id: 'culture_identity', fr: 'Culture / identité', en: 'Culture / identity', zh: '文化 / 身份' },
  { id: 'local_overseas', fr: 'Territoires / outre-mer', en: 'Local / overseas', zh: '地方 / 海外' },
  { id: 'other', fr: 'Autre', en: 'Other', zh: '其他' },
] as const;

export const STANCES = ['support', 'oppose', 'neutral', 'unclear'] as const;
export type Stance = (typeof STANCES)[number];

export function partyById(id: string): Party | undefined {
  return parties.find((party) => party.id === id);
}

export function candidateById(id: string): Candidate | undefined {
  return candidates.find((candidate) => candidate.id === id);
}

export function candidateBySlug(slug: string): Candidate | undefined {
  return candidates.find((candidate) => candidate.slug === slug);
}

export function partyColor(partyId: string | null | undefined): string {
  if (!partyId) return '#9ca3af';
  return partyById(partyId)?.color ?? '#9ca3af';
}

export function demoScore(candidateId: string): DemoScore | undefined {
  return demo.candidates.find((score) => score.candidate_id === candidateId);
}

export function departmentResult(code: string): DepartmentResult | undefined {
  return results2022.departments[code];
}

export function localizedName(candidate: Candidate, locale: Locale): string {
  return locale === 'zh' ? candidate.name_zh : locale === 'en' ? candidate.name_en : candidate.name_fr;
}

export function localizedBio(candidate: Candidate, locale: Locale): string {
  return locale === 'zh' ? candidate.bio_zh : locale === 'en' ? candidate.bio_en : candidate.bio_fr;
}

export function daysUntil(date: string, now = new Date()): number {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  return Math.max(0, Math.ceil((target - now.getTime()) / 86_400_000));
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace('.', ',')} %`;
}
