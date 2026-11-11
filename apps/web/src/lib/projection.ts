import { candidates, results2017, type DepartmentResult } from '@vlf/domain';

type PollRow = { candidate_id: string; avg: number; polls?: number };

const CANDIDATE_PARTY: Record<string, string> = {
  'marine-le-pen': 'rn',
  'jean-luc-melenchon': 'lfi',
  'gabriel-attal': 'renaissance',
  'edouard-philippe': 'renaissance',
  'raphael-glucksmann': 'ps',
  'bruno-retailleau': 'lr',
  'eric-zemmour': 'reconquete',
  'marine-tondelier': 'eelv',
  'fabien-roussel': 'pcf',
  'nicolas-dupont-aignan': 'dlf',
  'david-lisnard': 'lr',
  'xavier-bertrand': 'lr',
  'francois-hollande': 'ps',
  'francois-ruffin': 'ps',
  'olivier-faure': 'ps',
  'nathalie-arthaud': 'lo',
  'dominique-de-villepin': 'divers',
  'sarah-knafo': 'reconquete',
};

export interface ProjectionShare {
  candidate_id: string;
  name_fr: string;
  name_en: string;
  name_zh: string;
  party_id: string;
  pct: number;
  p10: number;
  p90: number;
  win_prob: number;
}

export interface ProjectionDepartment {
  code: string;
  name: string;
  region: string;
  winner_candidate: string;
  winner_party: string;
  winner_pct: number;
  margin: number;
  win_prob: number;
  winner_pct_p10: number;
  winner_pct_p90: number;
  margin_p10: number;
  margin_p90: number;
  shares: ProjectionShare[];
}

export interface ProjectionResult {
  model: string;
  selected: Array<{
    candidate_id: string;
    name_fr: string;
    name_en: string;
    name_zh: string;
    party_id: string;
    avg: number;
    sigma: number;
  }>;
  departments: Record<string, ProjectionDepartment>;
  national: {
    draws: number;
    win_prob: Record<string, number>;
    mean_share: Record<string, number>;
  };
  backtest: {
    method: string;
    baseline_year: number;
    target_year: number;
    regions: number;
    departments: number;
    uniform_accuracy: number;
    regional_accuracy: number;
    uniform_mae: number;
    regional_mae: number;
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

function weightedNationalShares(departments: Record<string, DepartmentResult>) {
  const votes = new Map<string, number>();
  let total = 0;
  for (const department of Object.values(departments)) {
    for (const row of department.results) {
      votes.set(row.party_id, (votes.get(row.party_id) ?? 0) + row.votes);
      total += row.votes;
    }
  }
  const shares = new Map<string, number>();
  for (const [partyId, count] of votes) {
    shares.set(partyId, total > 0 ? (count / total) * 100 : 0);
  }
  return { shares, total };
}

function regionLean(
  departments: Record<string, DepartmentResult>,
  national: Map<string, number>,
  partyId: string,
) {
  const byRegion = new Map<string, { votes: number; total: number }>();
  for (const department of Object.values(departments)) {
    const entry = byRegion.get(department.region) ?? { votes: 0, total: 0 };
    const partyVotes = department.results.find((row) => row.party_id === partyId)?.votes ?? 0;
    const totalVotes = department.results.reduce((sum, row) => sum + row.votes, 0);
    entry.votes += partyVotes;
    entry.total += totalVotes;
    byRegion.set(department.region, entry);
  }
  const lean = new Map<string, number>();
  for (const [region, entry] of byRegion) {
    const share = entry.total > 0 ? (entry.votes / entry.total) * 100 : 0;
    lean.set(region, share - (national.get(partyId) ?? 0));
  }
  return lean;
}

function selectCandidates(pollRows: PollRow[]) {
  const ranked = pollRows
    .map((row) => {
      const candidate = candidates.find((item) => item.id === row.candidate_id);
      const partyId = CANDIDATE_PARTY[row.candidate_id];
      if (!candidate || !partyId) return null;
      return { row, candidate, partyId };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.row.avg - a.row.avg);

  const selected: ProjectionResult['selected'] = [];
  const usedParties = new Set<string>();
  for (const item of ranked) {
    if (usedParties.has(item.partyId)) continue;
    usedParties.add(item.partyId);
    const polls = Math.max(1, item.row.polls ?? 1);
    selected.push({
      candidate_id: item.candidate.id,
      name_fr: item.candidate.name_fr,
      name_en: item.candidate.name_en,
      name_zh: item.candidate.name_zh,
      party_id: item.partyId,
      avg: item.row.avg,
      // Poll-count-aware uncertainty. More polls -> tighter national estimate.
      sigma: 1.1 + 5.5 / Math.sqrt(polls),
    });
    if (selected.length >= 6) break;
  }
  return selected;
}

function applySwing(
  department: DepartmentResult,
  selected: ProjectionResult['selected'],
  swing: Map<string, number>,
  regionalLean: Map<string, Map<string, number>>,
  regionNoise: Map<string, number>,
  departmentNoise: number,
  heterogeneity: number,
) {
  const shares = selected.map((candidate) => {
    const base = department.results.find((row) => row.party_id === candidate.party_id)?.pct ?? 0;
    const lean = regionalLean.get(candidate.party_id)?.get(department.region) ?? 0;
    const elasticity = clamp(1 + heterogeneity * Math.tanh(lean / 6), 0.55, 1.45);
    const regional = regionNoise.get(candidate.party_id) ?? 0;
    const value =
      base +
      (swing.get(candidate.party_id) ?? 0) * elasticity +
      regional +
      departmentNoise * (candidate.party_id === 'rn' ? 1 : 0.7);
    return Math.max(0, value);
  });
  const total = shares.reduce((sum, value) => sum + value, 0) || 1;
  return shares.map((value) => (value / total) * 100);
}

export function buildProjection(
  departments: Record<string, DepartmentResult>,
  pollRows: PollRow[],
  options: { draws?: number; seed?: number } = {},
): ProjectionResult {
  const draws = options.draws ?? 500;
  const seed = options.seed ?? 20270418;
  const { shares: national } = weightedNationalShares(departments);
  const selected = selectCandidates(pollRows);
  const selectedParties = selected.map((candidate) => candidate.party_id);
  const nationalSelected = new Map(
    selectedParties.map((partyId) => [partyId, national.get(partyId) ?? 0]),
  );

  const regionalLean = new Map<string, Map<string, number>>();
  for (const partyId of selectedParties) {
    regionalLean.set(partyId, regionLean(departments, national, partyId));
  }

  const departmentCodes = Object.keys(departments);
  const samples = new Map<string, number[][]>();
  for (const code of departmentCodes) samples.set(code, selected.map(() => []));
  const winCounts = new Map<string, number[]>();
  for (const code of departmentCodes) winCounts.set(code, selected.map(() => 0));
  const nationalWin = new Map<string, number>(selectedParties.map((partyId) => [partyId, 0]));
  const nationalShareSums = new Map<string, number>(
    selectedParties.map((partyId) => [partyId, 0]),
  );

  const rng = mulberry32(seed);
  for (let draw = 0; draw < draws; draw += 1) {
    const common = gaussian(rng) * 1.5;
    const pollShares = new Map<string, number>();
    for (const candidate of selected) {
      pollShares.set(
        candidate.party_id,
        Math.max(0, candidate.avg + common + gaussian(rng) * candidate.sigma),
      );
    }
    const pollTotal = Array.from(pollShares.values()).reduce((sum, value) => sum + value, 0) || 1;
    for (const partyId of selectedParties) {
      pollShares.set(partyId, ((pollShares.get(partyId) ?? 0) / pollTotal) * 100);
    }

    const swing = new Map<string, number>();
    for (const partyId of selectedParties) {
      swing.set(partyId, (pollShares.get(partyId) ?? 0) - (nationalSelected.get(partyId) ?? 0));
    }

    const regionNoise = new Map<string, number>();
    for (const partyId of selectedParties) {
      regionNoise.set(partyId, gaussian(rng) * 0.7);
    }

    const drawTotals = new Map<string, number>(selectedParties.map((partyId) => [partyId, 0]));
    let totalExprimes = 0;
    for (const code of departmentCodes) {
      const department = departments[code];
      const shares = applySwing(
        department,
        selected,
        swing,
        regionalLean,
        regionNoise,
        gaussian(rng) * 0.8,
        0.35,
      );
      const exprimes = department.exprimes || 1;
      totalExprimes += exprimes;
      let winnerIndex = 0;
      shares.forEach((value, index) => {
        samples.get(code)![index].push(value);
        drawTotals.set(selected[index].party_id, (drawTotals.get(selected[index].party_id) ?? 0) + value * exprimes);
        if (value > shares[winnerIndex]) winnerIndex = index;
      });
      winCounts.get(code)![winnerIndex] += 1;
    }

    let nationalWinner = selectedParties[0];
    let nationalWinnerShare = -1;
    for (const partyId of selectedParties) {
      const share = (drawTotals.get(partyId) ?? 0) / totalExprimes;
      nationalShareSums.set(partyId, (nationalShareSums.get(partyId) ?? 0) + share);
      if (share > nationalWinnerShare) {
        nationalWinnerShare = share;
        nationalWinner = partyId;
      }
    }
    nationalWin.set(nationalWinner, (nationalWin.get(nationalWinner) ?? 0) + 1);
  }

  const projected: Record<string, ProjectionDepartment> = {};
  for (const code of departmentCodes) {
    const department = departments[code];
    const values = samples.get(code)!;
    const shares = selected.map((candidate, index) => {
      const series = values[index];
      return {
        candidate_id: candidate.candidate_id,
        name_fr: candidate.name_fr,
        name_en: candidate.name_en,
        name_zh: candidate.name_zh,
        party_id: candidate.party_id,
        pct: Number((series.reduce((sum, value) => sum + value, 0) / draws).toFixed(1)),
        p10: Number(percentile(series, 0.1).toFixed(1)),
        p90: Number(percentile(series, 0.9).toFixed(1)),
        win_prob: Number(((winCounts.get(code)![index] ?? 0) / draws).toFixed(3)),
      };
    });
    shares.sort((a, b) => b.pct - a.pct);
    const winner = shares[0];
    const winnerSeries = values[selected.findIndex((candidate) => candidate.party_id === winner.party_id)];
    const margins: number[] = [];
    for (let drawIndex = 0; drawIndex < draws; drawIndex += 1) {
      const sorted = selected
        .map((candidate, index) => ({ pct: values[index][drawIndex], party: candidate.party_id }))
        .sort((a, b) => b.pct - a.pct);
      margins.push(sorted[0].pct - (sorted[1]?.pct ?? 0));
    }
    projected[code] = {
      code,
      name: department.name,
      region: department.region,
      winner_candidate: winner.name_fr,
      winner_party: winner.party_id,
      winner_pct: winner.pct,
      margin: Number((winner.pct - (shares[1]?.pct ?? 0)).toFixed(1)),
      win_prob: Number(((winCounts.get(code)![selected.findIndex((candidate) => candidate.party_id === winner.party_id)] ?? 0) / draws).toFixed(3)),
      winner_pct_p10: Number(percentile(winnerSeries, 0.1).toFixed(1)),
      winner_pct_p90: Number(percentile(winnerSeries, 0.9).toFixed(1)),
      margin_p10: Number(percentile(margins, 0.1).toFixed(1)),
      margin_p90: Number(percentile(margins, 0.9).toFixed(1)),
      shares,
    };
  }

  const backtest = backtestProjection(departments);
  const nationalWinProb: Record<string, number> = {};
  const nationalMeanShare: Record<string, number> = {};
  for (const partyId of selectedParties) {
    nationalWinProb[partyId] = Number(((nationalWin.get(partyId) ?? 0) / draws).toFixed(3));
    nationalMeanShare[partyId] = Number(((nationalShareSums.get(partyId) ?? 0) / draws).toFixed(2));
  }

  return {
    model: 'regional heterogeneous swing, 2022 department baseline, 500 seeded draws',
    selected,
    departments: projected,
    national: { draws, win_prob: nationalWinProb, mean_share: nationalMeanShare },
    backtest,
    uncertainty: {
      draws,
      seed,
      note: 'Intervals are model uncertainty from poll error and regional swing noise. They are not a confidence interval for the election outcome.',
    },
  };
}

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

const BLOC_ORDER = ['left', 'center', 'right', 'rn', 'rec', 'other'];

function normalizeBlocs(shares: Record<string, number>): Record<string, number> {
  const total = BLOC_ORDER.reduce((sum, bloc) => sum + Math.max(0, shares[bloc] ?? 0), 0) || 1;
  return Object.fromEntries(
    BLOC_ORDER.map((bloc) => [bloc, (Math.max(0, shares[bloc] ?? 0) / total) * 100]),
  );
}

function backtestProjection(departments: Record<string, DepartmentResult>) {
  const baseline = results2017.departments;
  const baselineCodes = Object.keys(baseline).filter((code) => departments[code]);

  const baselineNationalVotes = new Map<string, number>();
  let baselineTotal = 0;
  for (const department of Object.values(baseline)) {
    const exprimes = department.exprimes || 0;
    baselineTotal += exprimes;
    for (const bloc of BLOC_ORDER) {
      baselineNationalVotes.set(
        bloc,
        (baselineNationalVotes.get(bloc) ?? 0) + ((department.shares[bloc] ?? 0) / 100) * exprimes,
      );
    }
  }
  const baselineNational = new Map(
    BLOC_ORDER.map((bloc) => [bloc, ((baselineNationalVotes.get(bloc) ?? 0) / Math.max(1, baselineTotal)) * 100]),
  );

  const targetNationalVotes = new Map<string, number>();
  let targetTotal = 0;
  for (const department of Object.values(departments)) {
    const exprimes = department.exprimes || 0;
    targetTotal += exprimes;
    for (const row of department.results) {
      const bloc = PARTY_BLOC[row.party_id] ?? 'other';
      targetNationalVotes.set(bloc, (targetNationalVotes.get(bloc) ?? 0) + ((row.votes / Math.max(1, exprimes)) * 100) * exprimes);
    }
  }
  const targetNational = new Map(
    BLOC_ORDER.map((bloc) => [bloc, ((targetNationalVotes.get(bloc) ?? 0) / Math.max(1, targetTotal)) * 100]),
  );
  const swing = new Map(
    BLOC_ORDER.map((bloc) => [bloc, (targetNational.get(bloc) ?? 0) - (baselineNational.get(bloc) ?? 0)]),
  );

  const regionVotes = new Map<string, { votes: Record<string, number>; total: number }>();
  for (const department of Object.values(baseline)) {
    const entry = regionVotes.get(department.region) ?? {
      votes: Object.fromEntries(BLOC_ORDER.map((bloc) => [bloc, 0])),
      total: 0,
    };
    const exprimes = department.exprimes || 0;
    entry.total += exprimes;
    for (const bloc of BLOC_ORDER) {
      entry.votes[bloc] += ((department.shares[bloc] ?? 0) / 100) * exprimes;
    }
    regionVotes.set(department.region, entry);
  }
  const regionLean = new Map<string, Record<string, number>>();
  for (const [region, entry] of regionVotes) {
    regionLean.set(
      region,
      Object.fromEntries(
        BLOC_ORDER.map((bloc) => [
          bloc,
          ((entry.votes[bloc] ?? 0) / Math.max(1, entry.total)) * 100 - (baselineNational.get(bloc) ?? 0),
        ]),
      ),
    );
  }

  let uniformCorrect = 0;
  let regionalCorrect = 0;
  let uniformError = 0;
  let regionalError = 0;
  let compared = 0;
  const regions = new Set<string>();

  for (const code of baselineCodes) {
    const department = baseline[code];
    const actualDepartment = departments[code];
    const actualBloc = PARTY_BLOC[actualDepartment.winner_party] ?? 'other';
    const actualShares = normalizeBlocs(
      Object.fromEntries(
        actualDepartment.results.map((row) => [PARTY_BLOC[row.party_id] ?? 'other', row.pct]),
      ) as Record<string, number>,
    );
    const actualShare = actualShares[actualBloc] ?? actualDepartment.winner_pct;
    regions.add(department.region);

    for (const heterogeneity of [0, 0.35]) {
      const base = normalizeBlocs(department.shares);
      const lean = regionLean.get(department.region) ?? {};
      const projected = normalizeBlocs(
        Object.fromEntries(
          BLOC_ORDER.map((bloc) => {
            const elasticity = clamp(1 + heterogeneity * Math.tanh((lean[bloc] ?? 0) / 6), 0.55, 1.45);
            return [bloc, base[bloc] + (swing.get(bloc) ?? 0) * elasticity];
          }),
        ) as Record<string, number>,
      );
      const winner = BLOC_ORDER.reduce((best, bloc) =>
        projected[bloc] > projected[best] ? bloc : best,
      );
      const error = Math.abs((projected[actualBloc] ?? 0) - actualShare);
      if (heterogeneity === 0) {
        if (winner === actualBloc) uniformCorrect += 1;
        uniformError += error;
      } else {
        if (winner === actualBloc) regionalCorrect += 1;
        regionalError += error;
      }
    }
    compared += 1;
  }

  return {
    method: '2017 first-round baseline + 2017→2022 national bloc swing, compared with the actual 2022 department winner',
    baseline_year: 2017,
    target_year: 2022,
    regions: regions.size,
    departments: compared,
    uniform_accuracy: Number((uniformCorrect / Math.max(1, compared)).toFixed(3)),
    regional_accuracy: Number((regionalCorrect / Math.max(1, compared)).toFixed(3)),
    uniform_mae: Number((uniformError / Math.max(1, compared)).toFixed(2)),
    regional_mae: Number((regionalError / Math.max(1, compared)).toFixed(2)),
  };
}
