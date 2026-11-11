<script lang="ts">
  import { darkPartyColor } from '../lib/colors';
  import MapCanvas from './MapCanvas.svelte';

  type Dept = {
    code: string;
    name: string;
    region: string;
    turnout: number;
    winner_party: string | null;
    winner_candidate: string | null;
    winner_pct: number | null;
    results: Array<{ candidate: string; party_id: string; pct: number }>;
  };

  export let mapData: Record<string, Dept> = {};
  export let projection: Record<string, any> = {};
  export let projectionBacktest: Record<string, any> = {};
  export let lang: 'fr' | 'en' | 'zh' = 'fr';
  export let initialCode = '75';

  const L = {
    fr: { title: 'Carte', baseline: 'Baseline 2022', projection: 'Scénario 2027', departments: 'départements', detail: 'Détail', winner: 'Arrivé en tête', turnout: 'Participation', top: 'Top résultats', source: 'Source : Ministère de l’Intérieur / data.gouv.fr', noData: 'Pas de données', winProb: 'Probabilité de finir en tête', interval: 'Intervalle 80 %', note: 'Scénario mécanique — swing régional hétérogène, 500 tirages. Pas une prévision.', backtest: 'Backtest' },
    en: { title: 'Map', baseline: '2022 baseline', projection: '2027 scenario', departments: 'departments', detail: 'Detail', winner: 'First place', turnout: 'Turnout', top: 'Top results', source: 'Source: Ministry of the Interior / data.gouv.fr', noData: 'No data', winProb: 'Probability of leading', interval: '80% interval', note: 'Mechanical scenario — heterogeneous regional swing, 500 draws. Not a forecast.', backtest: 'Backtest' },
    zh: { title: '地图', baseline: '2022 基线', projection: '2027 情景', departments: '个省', detail: '详情', winner: '领先', turnout: '投票率', top: '主要结果', source: '来源：法国内政部 / data.gouv.fr', noData: '暂无数据', winProb: '领先概率', interval: '80% 区间', note: '机械情景 — 区域异质摆动，500 次抽样。不是预测。', backtest: '回测' },
  }[lang];

  let selectedCode = initialCode;
  let mode: 'baseline' | 'projection' = 'baseline';
  $: source = mode === 'projection' ? projection : mapData;
  $: dept = selectedCode ? source[selectedCode] : null;
  $: maxPct = dept
    ? Math.max(...(mode === 'projection' ? dept.shares.map((result: any) => result.pct) : dept.results.map((result: any) => result.pct)), 1)
    : 1;

  function pct(value: number | null | undefined): string {
    if (typeof value !== 'number') return '—';
    return `${value.toFixed(1).replace('.', ',')} %`;
  }
</script>

<h1 class="sr-only">{L.title} — {Object.keys(mapData).length} {L.departments}</h1>

<div class="h-full overflow-y-auto lg:overflow-hidden p-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_360px]">
  <section class="panel min-h-[420px]">
    <div class="panel-head">
      <div class="flex items-center gap-2">
        <div class="panel-title">{L.title}</div>
        <span class="font-mono text-[9px] text-dim">/ {Object.keys(mapData).length} {L.departments}</span>
      </div>
      <div class="flex items-center gap-1 font-mono text-[9px]">
        <button type="button" class={['border px-1.5 py-0.5', mode === 'baseline' ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-line text-dim/60 hover:text-fg'].join(' ')} on:click={() => (mode = 'baseline')}>{L.baseline}</button>
        <button type="button" class={['border px-1.5 py-0.5', mode === 'projection' ? 'border-amber/50 bg-amber/10 text-amber' : 'border-line text-dim/60 hover:text-fg'].join(' ')} on:click={() => (mode = 'projection')}>{L.projection}</button>
      </div>
    </div>
    <div class="flex-1 min-h-0">
      <MapCanvas data={mapData} {projection} {mode} {lang} selectedCode={selectedCode} onSelect={(code) => (selectedCode = code)} />
    </div>
  </section>

  <section class="panel min-h-[420px]">
    <div class="panel-head">
      <div class="panel-title">{L.detail}</div>
      <span class="font-mono text-[9px] text-dim">{selectedCode}</span>
    </div>
    <div class="panel-body scroll-thin p-3">
      {#if dept}
        <div class="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">{dept.code} · {dept.region}</div>
        <h2 class="mt-1 font-display text-3xl text-fg">{dept.name}</h2>

        <div class="mt-4 border-y border-line py-3">
          <div class="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{L.winner}</div>
          <div class="mt-1 flex items-center gap-2">
            <span class="h-2.5 w-2.5 rounded-full" style={`background:${darkPartyColor(dept.winner_party)}`}></span>
            <span class="text-sm text-fg">{mode === 'projection' && dept.shares?.[0] ? dept.shares[0].name_fr : dept.winner_candidate}</span>
            <span class="ml-auto font-mono text-2xl font-bold text-cyan">{pct(dept.winner_pct)}</span>
          </div>
          {#if mode === 'projection'}
            <div class="mt-2 grid grid-cols-2 gap-2 font-mono text-[9px]">
              <div class="border border-line px-2 py-1">
                <div class="uppercase tracking-[0.1em] text-dim">{L.winProb}</div>
                <div class="mt-0.5 text-sm text-amber">{typeof dept.win_prob === 'number' ? `${Math.round(dept.win_prob * 100)} %` : '—'}</div>
              </div>
              <div class="border border-line px-2 py-1">
                <div class="uppercase tracking-[0.1em] text-dim">{L.interval}</div>
                <div class="mt-0.5 text-sm text-fg">{pct(dept.winner_pct_p10)} – {pct(dept.winner_pct_p90)}</div>
              </div>
            </div>
          {:else}
            <div class="mt-2 flex justify-between font-mono text-[9px] text-dim">
              <span>{L.turnout}</span>
              <span class="text-fg">{pct(dept.turnout)}</span>
            </div>
          {/if}
        </div>

        <div class="mt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{L.top}</div>
        <div class="mt-2 space-y-2">
          {#each (mode === 'projection' ? dept.shares.slice(0, 10) : dept.results.slice(0, 10)) as result}
            <div>
              <div class="flex justify-between font-mono text-[10px]">
                <span class="truncate text-fg">{result.candidate ?? result.name_fr}</span>
                <span class="text-dim">{pct(result.pct)}</span>
              </div>
              <div class="mt-1 h-1 bg-panel2">
                <div class="h-full" style={`width:${Math.max(3, (result.pct / maxPct) * 100)}%; background:${darkPartyColor(result.party_id)}`}></div>
              </div>
            </div>
          {/each}
        </div>

        {#if mode === 'projection'}
          <p class="mt-4 border-t border-line pt-3 font-mono text-[9px] leading-relaxed text-amber/80">{L.note}</p>
          {#if projectionBacktest?.departments}
            <p class="mt-1 font-mono text-[9px] text-dim">{L.backtest} {projectionBacktest.baseline_year}→{projectionBacktest.target_year} · {Math.round((projectionBacktest.uniform_accuracy ?? 0) * 100)}% / {Math.round((projectionBacktest.regional_accuracy ?? 0) * 100)}% · n={projectionBacktest.departments}</p>
          {/if}
        {/if}
        <p class="mt-4 border-t border-line pt-3 font-mono text-[9px] text-dim">{L.source}</p>
      {:else}
        <p class="text-sm text-dim">{L.noData}</p>
      {/if}
    </div>
  </section>
</div>
