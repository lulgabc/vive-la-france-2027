import {
  candidates,
  legislative2022,
  legislative2024,
  type LegislativeConstituency,
  type LegislativeFile,
} from '@vlf/domain';

type PollRow = { candidate_id: string; avg: number; polls?: number };

export const BLOCS = ['left', 'center', 'right', 'rn', 'rec', 'other'] as const;
export type Bloc = (typeof BLOCS)[number];
export type BaselineYear = 2022 | 2024;
export type Strategy = 'none' | 'republican' | 'left-unity' | 'rn-alliance';

export const BLOC_META: Record<Bloc, { fr: string; en: string; zh: string; color: string; party: string }> = {
  left: { fr: 'Gauche', en: 'Left', zh: '左翼', color: '#e5484d', party: 'lfi' },
  center: { fr: 'Centre', en: 'Centre', zh: '中间派', color: '#4f7cff', party: 'renaissance' },
  right: { fr: 'Droite', en: 'Right', zh: '右翼', color: '#2f9e8f', party: 'lr' },
  rn: { fr: 'Rassemblement national', en: 'National Rally', zh: '国民联盟', color: '#8a6cff', party: 'rn' },
  rec: { fr: 'Reconquête', en: 'Reconquête', zh: '收复失地', color: '#b388ff', party: 'reconquete' },
  other: { fr: 'Autres', en: 'Others', zh: '其他', color: '#9ca3af', party: 'divers' },
};

const PARTY_BLOC: Record<string, Bloc> = {
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

const BASE_AFFINITY: Record<Bloc, Record<Bloc, number>> = {
  left: { left: 1.5, center: 0.9, right: 0.3, rn: 0.2, rec: 0.1, other: 0.6 },
  center: { left: 0.8, center: 1.4, right: 1.1, rn: 0.5, rec: 0.3, other: 0.6 },
  right: { left: 0.4, center: 1.1, right: 1.5, rn: 1.2, rec: 0.9, other: 0.6 },
  rn: { left: 0.2, center: 0.4, right: 1.0, rn: 1.6, rec: 1.2, other: 0.6 },
  rec: { left: 0.1, center: 0.3, right: 1.0, rn: 1.3, rec: 1.5, other: 0.6 },
  other: { left: 1, center: 1, right: 1, rn: 1, rec: 1, other: 1 },
};

const AFFINITY: Record<Strategy, Record<Bloc, Record<Bloc, number>>> = {
  none: BASE_AFFINITY,
  republican: {
    left: { left: 1.5, center: 1.2, right: 0.8, rn: 0.1, rec: 0.05, other: 0.6 },
    center: { left: 1.1, center: 1.4, right: 1.3, rn: 0.2, rec: 0.1, other: 0.6 },
    right: { left: 1.0, center: 1.3, right: 1.5, rn: 0.2, rec: 0.3, other: 0.6 },
    rn: { left: 0.1, center: 0.3, right: 0.8, rn: 1.6, rec: 0.9, other: 0.6 },
    rec: { left: 0.05, center: 0.2, right: 0.8, rn: 1.0, rec: 1.5, other: 0.6 },
    other: { left: 1, center: 1, right: 1, rn: 0.3, rec: 0.3, other: 1 },
  },
  'left-unity': {
    left: { left: 1.8, center: 0.6, right: 0.2, rn: 0.1, rec: 0.05, other: 0.6 },
    center: { left: 1.3, center: 1.3, right: 1.0, rn: 0.2, rec: 0.1, other: 0.6 },
    right: { left: 0.5, center: 1.2, right: 1.5, rn: 1.0, rec: 0.8, other: 0.6 },
    rn: { left: 0.1, center: 0.4, right: 1.1, rn: 1.6, rec: 1.2, other: 0.6 },
    rec: { left: 0.05, center: 0.3, right: 1.0, rn: 1.3, rec: 1.5, other: 0.6 },
    other: { left: 1, center: 1, right: 1, rn: 1, rec: 1, other: 1 },
  },
  'rn-alliance': {
    left: { left: 1.6, center: 0.9, right: 0.3, rn: 0.1, rec: 0.05, other: 0.6 },
    center: { left: 1.0, center: 1.3, right: 1.2, rn: 0.2, rec: 0.1, other: 0.6 },
    right: { left: 0.3, center: 0.9, right: 1.5, rn: 1.4, rec: 1.0, other: 0.6 },
    rn: { left: 0.1, center: 0.4, right: 1.3, rn: 1.8, rec: 1.5, other: 0.6 },
    rec: { left: 0.05, center: 0.3, right: 1.2, rn: 1.5, rec: 1.6, other: 0.6 },
    other: { left: 1, center: 1, right: 1, rn: 1, rec: 1, other: 1 },
  },
};

const BASELINES: Record<BaselineYear, LegislativeFile> = {
  2022: legislative2022,
  2024: legislative2024,
};

export interface LegislativeSeat {
  code: string;
  name: string;
  department_code: string;
  department_name: string;
  region: string;
  winner_bloc: Bloc;
  winner_pct: number;
  margin: number;
  win_prob: number;
  runoff: boolean;
  shares: Record<Bloc, number>;
  baseline_winner: Bloc;
  baseline_runoff_winner: Bloc | null;
}

export interface LegislativeResult {
  model: string;
  baseline_year: BaselineYear;
  strategy: Strategy;
  national: {
    poll: Record<Bloc, number>;
    baseline: Record<Bloc, number>;
    swing: Record<Bloc, number>;
  };
  seats: Record<Bloc, number>;
  seat_prob: Record<Bloc, { p10: number; p90: number }>;
  constituencies: Record<string, LegislativeSeat>;
  backtest: {
    method: string;
    accuracy: number;
    constituencies: number;
  };
  uncertainty: {
    draws: number;
    seed: number;
    note: string;
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function normalizeBlocs(shares: Record<string, number>): Record<Bloc, number> {
  const values = BLOCS.map((bloc) => Math.max(0, shares[bloc] ?? 0));
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(BLOCS.map((bloc, index) => [bloc, (values[index] / total) * 100])) as Record<Bloc, number>;
}

function pollBlocShares(pollRows: PollRow[]): Record<Bloc, number> {
  const sums: Record<Bloc, number> = { left: 0, center: 0, right: 0, rn: 0, rec: 0, other: 0 };
  for (const row of pollRows) {
    const candidate = candidates.find((item) => item.id === row.candidate_id);
    const bloc = candidate ? PARTY_BLOC[candidate.party_id] ?? null : null;
    if (!bloc) continue;
    sums[bloc] += Math.max(0, row.avg);
  }
  return normalizeBlocs(sums);
}

function regionLean(baseline: LegislativeFile): Map<string, Record<Bloc, number>> {
  const national = baseline.national.shares as Record<string, number>;
  const byRegion = new Map<string, Record<string, number>>();
  const totals = new Map<string, number>();
  for (const constituency of Object.values(baseline.constituencies)) {
    const region = constituency.region;
    const entry = byRegion.get(region) ?? { left: 0, center: 0, right: 0, rn: 0, rec: 0, other: 0 };
    for (const bloc of BLOCS) {
      entry[bloc] += ((constituency.shares[bloc] ?? 0) / 100) * constituency.exprimes;
    }
    totals.set(region, (totals.get(region) ?? 0) + constituency.exprimes);
    byRegion.set(region, entry);
  }
  const lean = new Map<string, Record<Bloc, number>>();
  for (const [region, entry] of byRegion) {
    const total = totals.get(region) || 1;
    const shares = Object.fromEntries(
      BLOCS.map((bloc) => [bloc, ((entry[bloc] ?? 0) / total) * 100]),
    ) as Record<Bloc, number>;
    lean.set(
      region,
      Object.fromEntries(BLOCS.map((bloc) => [bloc, shares[bloc] - (national[bloc] ?? 0)])) as Record<Bloc, number>,
    );
  }
  return lean;
}

function runoffShares(
  shares: Record<Bloc, number>,
  affinity: Record<Bloc, Record<Bloc, number>>,
): { winner: Bloc; pct: number; margin: number; runoff: boolean } {
  const ranked = BLOCS.map((bloc) => ({ bloc, pct: shares[bloc] })).sort((a, b) => b.pct - a.pct);
  const [first, second] = ranked;
  if (!second || first.pct >= 50) {
    return { winner: first.bloc, pct: first.pct, margin: first.pct - (second?.pct ?? 0), runoff: false };
  }

  let firstRunoff = first.pct;
  let secondRunoff = second.pct;
  for (const bloc of BLOCS) {
    if (bloc === first.bloc || bloc === second.bloc) continue;
    const votes = shares[bloc];
    if (votes <= 0) continue;
    const affinityFirst = affinity[bloc][first.bloc] * first.pct;
    const affinitySecond = affinity[bloc][second.bloc] * second.pct;
    const denominator = affinityFirst + affinitySecond || 1;
    firstRunoff += (votes * affinityFirst) / denominator;
    secondRunoff += (votes * affinitySecond) / denominator;
  }
  const total = firstRunoff + secondRunoff || 1;
  const firstPct = (firstRunoff / total) * 100;
  const secondPct = (secondRunoff / total) * 100;
  return firstPct >= secondPct
    ? { winner: first.bloc, pct: firstPct, margin: firstPct - secondPct, runoff: true }
    : { winner: second.bloc, pct: secondPct, margin: secondPct - firstPct, runoff: true };
}

function applySwing(
  constituency: LegislativeConstituency,
  swing: Record<Bloc, number>,
  lean: Map<string, Record<Bloc, number>>,
  regionNoise: Record<Bloc, number>,
  departmentNoise: number,
  heterogeneity = 0.35,
): Record<Bloc, number> {
  const base = normalizeBlocs(constituency.shares);
  const region = lean.get(constituency.region);
  const shares = Object.fromEntries(
    BLOCS.map((bloc) => {
      const elasticity = clamp(1 + heterogeneity * Math.tanh((region?.[bloc] ?? 0) / 6), 0.55, 1.45);
      const value =
        base[bloc] +
        (swing[bloc] ?? 0) * elasticity +
        (regionNoise[bloc] ?? 0) +
        departmentNoise * (bloc === 'rn' ? 1 : 0.7);
      return [bloc, Math.max(0, value)];
    }),
  ) as Record<Bloc, number>;
  return normalizeBlocs(shares);
}

export function buildLegislativeScenario(
  pollRows: PollRow[],
  options: {
    baselineYear?: BaselineYear;
    strategy?: Strategy;
    draws?: number;
    seed?: number;
  } = {},
): LegislativeResult {
  const baselineYear = options.baselineYear ?? 2022;
  const strategy = options.strategy ?? 'none';
  const draws = options.draws ?? 200;
  const seed = options.seed ?? (baselineYear === 2022 ? 20270613 : 20270707);
  const baseline = BASELINES[baselineYear];
  const affinity = AFFINITY[strategy];
  const baselineNational = normalizeBlocs(baseline.national.shares);
  const poll = pollBlocShares(pollRows);
  const swing = Object.fromEntries(
    BLOCS.map((bloc) => [bloc, poll[bloc] - baselineNational[bloc]]),
  ) as Record<Bloc, number>;
  const lean = regionLean(baseline);
  const constituencies = Object.values(baseline.constituencies);

  const winCounts = new Map<string, Record<Bloc, number>>();
  const seatSamples: Record<Bloc, number[]> = { left: [], center: [], right: [], rn: [], rec: [], other: [] };
  for (const constituency of constituencies) {
    winCounts.set(
      constituency.code,
      Object.fromEntries(BLOCS.map((bloc) => [bloc, 0])) as Record<Bloc, number>,
    );
  }

  const rng = mulberry32(seed);
  for (let draw = 0; draw < draws; draw += 1) {
    const common = gaussian(rng) * 1.2;
    const drawPoll = Object.fromEntries(
      BLOCS.map((bloc) => [bloc, Math.max(0, poll[bloc] + common + gaussian(rng) * 1.5)]),
    ) as Record<Bloc, number>;
    const drawPollNorm = normalizeBlocs(drawPoll);
    const drawSwing = Object.fromEntries(
      BLOCS.map((bloc) => [bloc, drawPollNorm[bloc] - baselineNational[bloc]]),
    ) as Record<Bloc, number>;
    const regionNoise = Object.fromEntries(
      BLOCS.map((bloc) => [bloc, gaussian(rng) * 0.6]),
    ) as Record<Bloc, number>;
    const seats: Record<Bloc, number> = { left: 0, center: 0, right: 0, rn: 0, rec: 0, other: 0 };

    for (const constituency of constituencies) {
      const shares = applySwing(constituency, drawSwing, lean, regionNoise, gaussian(rng) * 0.7);
      const result = runoffShares(shares, affinity);
      winCounts.get(constituency.code)![result.winner] += 1;
      seats[result.winner] += 1;
    }
    for (const bloc of BLOCS) seatSamples[bloc].push(seats[bloc]);
  }

  const resultSeats: Record<Bloc, number> = { left: 0, center: 0, right: 0, rn: 0, rec: 0, other: 0 };
  const output: Record<string, LegislativeSeat> = {};
  for (const constituency of constituencies) {
    const shares = applySwing(
      constituency,
      swing,
      lean,
      { left: 0, center: 0, right: 0, rn: 0, rec: 0, other: 0 },
      0,
    );
    const result = runoffShares(shares, affinity);
    const counts = winCounts.get(constituency.code)!;
    resultSeats[result.winner] += 1;
    output[constituency.code] = {
      code: constituency.code,
      name: constituency.name,
      department_code: constituency.department_code,
      department_name: constituency.department_name,
      region: constituency.region,
      winner_bloc: result.winner,
      winner_pct: Number(result.pct.toFixed(1)),
      margin: Number(result.margin.toFixed(1)),
      win_prob: Number(((counts[result.winner] ?? 0) / draws).toFixed(3)),
      runoff: result.runoff,
      shares: Object.fromEntries(BLOCS.map((bloc) => [bloc, Number(shares[bloc].toFixed(1))])) as Record<Bloc, number>,
      baseline_winner: constituency.winner_bloc as Bloc,
      baseline_runoff_winner: (constituency.runoff?.winner_bloc as Bloc | undefined) ?? null,
    };
  }

  const seatProb = Object.fromEntries(
    BLOCS.map((bloc) => [
      bloc,
      {
        p10: percentile(seatSamples[bloc], 0.1),
        p90: percentile(seatSamples[bloc], 0.9),
      },
    ]),
  ) as Record<Bloc, { p10: number; p90: number }>;

  return {
    model: `mechanical legislative scenario: ${baselineYear} constituency baseline + national bloc swing + ${strategy} runoff affinity`,
    baseline_year: baselineYear,
    strategy,
    national: { poll, baseline: baselineNational, swing },
    seats: resultSeats,
    seat_prob: seatProb,
    constituencies: output,
    backtest: backtestLegislative(constituencies, lean, affinity),
    uncertainty: {
      draws,
      seed,
      note: 'Seat ranges are model uncertainty from national poll error and regional swing noise. They are not a forecast of the 2027 legislative election.',
    },
  };
}

function backtestLegislative(
  constituencies: LegislativeConstituency[],
  lean: Map<string, Record<Bloc, number>>,
  affinity: Record<Bloc, Record<Bloc, number>>,
) {
  let correct = 0;
  let compared = 0;
  for (const constituency of constituencies) {
    if (!constituency.runoff) continue;
    const shares = applySwing(
      constituency,
      { left: 0, center: 0, right: 0, rn: 0, rec: 0, other: 0 },
      lean,
      { left: 0, center: 0, right: 0, rn: 0, rec: 0, other: 0 },
      0,
      0,
    );
    const predicted = runoffShares(shares, affinity).winner;
    if (predicted === constituency.runoff.winner_bloc) correct += 1;
    compared += 1;
  }
  return {
    method: 'baseline first-round bloc shares -> affinity runoff, compared with the actual baseline runoff winner',
    accuracy: Number((correct / Math.max(1, compared)).toFixed(3)),
    constituencies: compared,
  };
}
