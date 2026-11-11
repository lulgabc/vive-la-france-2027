<script lang="ts">
  import LegislativeMap from './LegislativeMap.svelte';
  import { BLOCS, BLOC_META, type Bloc, type LegislativeResult } from '../lib/legislative';

  export let scenario: LegislativeResult;
  export let baselineYear: 2022 | 2024 = 2022;
  export let strategy: 'none' | 'republican' | 'left-unity' | 'rn-alliance' = 'none';
  export let lang: 'fr' | 'en' | 'zh' = 'fr';

  const labels = {
    fr: {
      title: 'Législatives 2027',
      subtitle: `Scénario mécanique à partir des 577 circonscriptions de ${baselineYear}`,
      seats: 'sièges',
      majority: 'majorité absolue 289',
      seatRange: 'Fourchette 80 %',
      swing: 'Swing national',
      map: 'Circonscriptions',
      detail: 'Détail',
      winner: 'Bloc arrivé en tête',
      simulatedRunoff: 'second tour simulé',
      firstRoundOnly: '1er tour',
      electedFirstRound: 'Élu au 1er tour',
      probability: 'Probabilité de victoire',
      margin: 'Marge',
      firstRound: 'Part des blocs au 1er tour',
      baseline: `Résultat ${baselineYear}`,
      runoff: `Second tour ${baselineYear}`,
      note: `Scénario mécanique — base ${baselineYear}, swing national, transferts « ${({none:'affinités 2022',republican:'front républicain','left-unity':'union à gauche','rn-alliance':'alliance RN'} as any)[strategy]} ». Pas une prévision.`,
      backtest: 'Backtest du modèle de second tour',
      accuracy: 'précision',
      constituencies: 'circonscriptions',
      mapNote: '539 contours métropolitains affichés ; 577 sièges modélisés, outre-mer inclus.',
      noData: 'Sélectionnez une circonscription.',
      method: 'Méthode',
      baselineLabel: 'Base',
      strategyLabel: 'Transferts',
      strategies: { none: 'Affinités 2022', republican: 'Front républicain', 'left-unity': 'Union à gauche', 'rn-alliance': 'Alliance RN' },
    },
    en: {
      title: 'Legislative 2027',
      subtitle: `Mechanical scenario from the 577 constituencies of ${baselineYear}`,
      seats: 'seats',
      majority: 'absolute majority 289',
      seatRange: '80% range',
      swing: 'National swing',
      map: 'Constituencies',
      detail: 'Detail',
      winner: 'Leading bloc',
      simulatedRunoff: 'simulated runoff',
      firstRoundOnly: 'first round',
      electedFirstRound: 'Elected in first round',
      probability: 'Win probability',
      margin: 'Margin',
      firstRound: 'First-round bloc shares',
      baseline: `${baselineYear} result`,
      runoff: `${baselineYear} runoff`,
      note: `Mechanical scenario — ${baselineYear} baseline, national swing, « ${({none:'2022 affinities',republican:'republican front','left-unity':'left unity','rn-alliance':'RN alliance'} as any)[strategy]} » transfers. Not a forecast.`,
      backtest: 'Runoff model backtest',
      accuracy: 'accuracy',
      constituencies: 'constituencies',
      mapNote: '539 metropolitan contours shown; 577 seats modelled, including overseas.',
      noData: 'Select a constituency.',
      method: 'Method',
      baselineLabel: 'Baseline',
      strategyLabel: 'Transfers',
      strategies: { none: '2022 affinities', republican: 'Republican front', 'left-unity': 'Left unity', 'rn-alliance': 'RN alliance' },
    },
    zh: {
      title: '2027 立法选举',
      subtitle: `基于 ${baselineYear} 年 577 个选区的机械情景`,
      seats: '席',
      majority: '绝对多数 289',
      seatRange: '80% 区间',
      swing: '全国摆动',
      map: '选区',
      detail: '详情',
      winner: '领先阵营',
      simulatedRunoff: '模拟第二轮',
      firstRoundOnly: '首轮',
      electedFirstRound: '首轮当选',
      probability: '胜选概率',
      margin: '差距',
      firstRound: '首轮阵营得票',
      baseline: `${baselineYear} 结果`,
      runoff: `${baselineYear} 第二轮`,
      note: `机械情景 — ${baselineYear} 基线、全国摆动、${({none:'2022 亲和度',republican:'共和阵线','left-unity':'左翼联合','rn-alliance':'RN 联盟'} as any)[strategy]} 转移。不是预测。`,
      backtest: '第二轮模型回测',
      accuracy: '准确率',
      constituencies: '个选区',
      mapNote: '地图显示 539 个本土选区轮廓；模型覆盖 577 席（含海外）。',
      noData: '请选择一个选区。',
      method: '方法',
      baselineLabel: '基线',
      strategyLabel: '转移',
      strategies: { none: '2022 亲和度', republican: '共和阵线', 'left-unity': '左翼联合', 'rn-alliance': 'RN 联盟' },
    },
  }[lang];

  let selectedCode = Object.keys(scenario.constituencies)[0] ?? '';
  $: selected = selectedCode ? scenario.constituencies[selectedCode] : null;
  $: seatTotal = BLOCS.reduce((sum, bloc) => sum + (scenario.seats[bloc] ?? 0), 0);

  function pct(value: number | null | undefined): string {
    if (typeof value !== 'number') return '—';
    return `${value.toFixed(1).replace('.', ',')} %`;
  }
</script>

<div class="h-full min-h-0 p-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_minmax(0,1fr)]">
  <section class="panel lg:col-span-2">
    <div class="panel-head">
      <div>
        <div class="panel-title">{labels.title}</div>
        <div class="font-mono text-[9px] text-dim">{labels.subtitle}</div>
      </div>
      <div class="font-mono text-[9px] text-dim">{seatTotal} {labels.seats} · {labels.majority}</div>
    </div>
    <div class="p-3">
      <div class="flex h-5 w-full overflow-hidden border border-line">
        {#each BLOCS as bloc}
          {@const count = scenario.seats[bloc] ?? 0}
          <div
            class="h-full"
            style={`width:${(count / Math.max(1, seatTotal)) * 100}%; background:${BLOC_META[bloc].color}`}
            title={`${BLOC_META[bloc][lang]}: ${count}`}
          ></div>
        {/each}
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2 font-mono text-[9px]">
        <span class="uppercase tracking-[0.1em] text-dim">{labels.baselineLabel}</span>
        {#each [2022, 2024] as year}
          <a
            href={`?baseline=${year}&strategy=${strategy}`}
            class:list={['border px-2 py-0.5', baselineYear === year ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-line text-dim hover:text-fg']}
          >{year}</a>
        {/each}
        <span class="ml-2 uppercase tracking-[0.1em] text-dim">{labels.strategyLabel}</span>
        {#each Object.entries(labels.strategies) as [key, label]}
          <a
            href={`?baseline=${baselineYear}&strategy=${key}`}
            class:list={['border px-2 py-0.5', strategy === key ? 'border-amber/60 bg-amber/10 text-amber' : 'border-line text-dim hover:text-fg']}
          >{label}</a>
        {/each}
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {#each BLOCS as bloc}
          <div class="border border-line px-2 py-1.5">
            <div class="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-dim">
              <span class="h-2 w-2 rounded-full" style={`background:${BLOC_META[bloc].color}`}></span>
              <span class="truncate">{BLOC_META[bloc][lang]}</span>
            </div>
            <div class="mt-0.5 flex items-baseline gap-1">
              <span class="font-display text-xl font-semibold text-fg">{scenario.seats[bloc] ?? 0}</span>
              <span class="font-mono text-[8px] text-dim">{Math.round(scenario.seat_prob[bloc]?.p10 ?? 0)}–{Math.round(scenario.seat_prob[bloc]?.p90 ?? 0)}</span>
            </div>
          </div>
        {/each}
      </div>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[8px] text-dim">
        <span>{labels.swing}: {BLOCS.map((bloc) => `${BLOC_META[bloc][lang]} ${scenario.national.swing[bloc] > 0 ? '+' : ''}${scenario.national.swing[bloc].toFixed(1)}`).join(' · ')}</span>
        <span>{labels.backtest}: {Math.round(scenario.backtest.accuracy * 100)}% {labels.accuracy} · n={scenario.backtest.constituencies}</span>
      </div>
    </div>
  </section>

  <section class="panel min-h-[360px]">
    <div class="panel-head">
      <div class="panel-title">{labels.map}</div>
      <span class="font-mono text-[9px] text-dim">{Object.keys(scenario.constituencies).length} {labels.constituencies}</span>
    </div>
    <div class="flex-1 min-h-0">
      <LegislativeMap
        constituencies={scenario.constituencies}
        {selectedCode}
        onSelect={(code) => (selectedCode = code)}
        {lang}
      />
    </div>
    <div class="border-t border-line px-2 py-1 font-mono text-[8px] text-dim">{labels.mapNote}</div>
  </section>

  <section class="panel min-h-[360px]">
    <div class="panel-head">
      <div class="panel-title">{labels.detail}</div>
      <span class="font-mono text-[9px] text-dim">{selectedCode}</span>
    </div>
    <div class="panel-body scroll-thin p-3">
      {#if selected}
        <div class="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">{selected.department_code} · {selected.region}</div>
        <h2 class="mt-1 font-display text-2xl text-fg">{selected.name}</h2>
        <div class="mt-1 font-mono text-[10px] text-dim">{selected.department_name}</div>

        <div class="mt-3 border-y border-line py-3">
          <div class="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{labels.winner}</div>
          <div class="mt-1 flex items-center gap-2">
            <span class="h-2.5 w-2.5 rounded-full" style={`background:${BLOC_META[selected.winner_bloc].color}`}></span>
            <span class="text-sm text-fg">{BLOC_META[selected.winner_bloc][lang]}</span>
            <span class="ml-auto font-mono text-xl font-bold text-cyan">{pct(selected.winner_pct)}</span>
          </div>
          <div class="mt-0.5 text-right font-mono text-[8px] uppercase tracking-[0.1em] text-dim">
            {selected.runoff ? labels.simulatedRunoff : labels.firstRoundOnly}
          </div>
          <div class="mt-2 grid grid-cols-2 gap-2 font-mono text-[9px]">
            <div class="border border-line px-2 py-1">
              <div class="uppercase tracking-[0.1em] text-dim">{labels.probability}</div>
              <div class="mt-0.5 text-sm text-amber">{Math.round(selected.win_prob * 100)} %</div>
            </div>
            <div class="border border-line px-2 py-1">
              <div class="uppercase tracking-[0.1em] text-dim">{labels.margin}</div>
              <div class="mt-0.5 text-sm text-fg">{pct(selected.margin)}</div>
            </div>
          </div>
        </div>

        <div class="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{labels.firstRound}</div>
        <div class="mt-2 space-y-1.5">
          {#each BLOCS as bloc}
            <div>
              <div class="flex justify-between font-mono text-[10px]">
                <span class="text-fg">{BLOC_META[bloc][lang]}</span>
                <span class="text-dim">{pct(selected.shares[bloc])}</span>
              </div>
              <div class="mt-0.5 h-1 bg-panel2">
                <div class="h-full" style={`width:${Math.max(2, selected.shares[bloc])}%; background:${BLOC_META[bloc].color}`}></div>
              </div>
            </div>
          {/each}
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2 font-mono text-[9px]">
          <div class="border border-line px-2 py-1">
            <div class="uppercase tracking-[0.1em] text-dim">{labels.baseline}</div>
            <div class="mt-0.5 text-fg">{BLOC_META[selected.baseline_winner]?.[lang] ?? selected.baseline_winner}</div>
          </div>
          <div class="border border-line px-2 py-1">
            <div class="uppercase tracking-[0.1em] text-dim">{labels.runoff}</div>
            <div class="mt-0.5 text-fg">{selected.baseline_runoff_winner ? (BLOC_META[selected.baseline_runoff_winner]?.[lang] ?? selected.baseline_runoff_winner) : labels.electedFirstRound}</div>
          </div>
        </div>

        <p class="mt-3 border-t border-line pt-3 font-mono text-[8px] leading-relaxed text-amber/80">{labels.note}</p>
      {:else}
        <p class="text-sm text-dim">{labels.noData}</p>
      {/if}
    </div>
  </section>
</div>
