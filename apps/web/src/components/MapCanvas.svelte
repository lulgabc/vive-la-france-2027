<script lang="ts">
  import { partyById } from '@vlf/domain';
  import { geoConicConformal, geoPath } from 'd3-geo';
  import { onMount, tick } from 'svelte';
  import { darkPartyColor } from '../lib/colors';

  type Dept = {
    code: string;
    name: string;
    region: string;
    winner_party: string | null;
    winner_candidate: string | null;
    winner_pct: number | null;
    margin?: number;
    win_prob?: number;
    turnout?: number;
  };

  export let data: Record<string, Dept> = {};
  export let projection: Record<string, Dept> = {};
  export let mode: 'baseline' | 'projection' = 'baseline';
  export let lang: 'fr' | 'en' | 'zh' = 'fr';
  export let selectedCode: string | null = null;
  export let onSelect: ((code: string) => void) | undefined = undefined;

  const labels = {
    fr: { baseline: 'Baseline 2022', projection: 'Scénario 2027', departments: 'départements', noData: 'Pas de données', winner: 'Arrivé en tête', turnout: 'Participation' },
    en: { baseline: '2022 baseline', projection: '2027 scenario', departments: 'departments', noData: 'No data', winner: 'First place', turnout: 'Turnout' },
    zh: { baseline: '2022 基线', projection: '2027 情景', departments: '个省', noData: '暂无数据', winner: '领先', turnout: '投票率' },
  };

  let paths: Array<{ code: string; name: string; d: string; color: string; margin: number; winProb: number; dept: Dept | null }> = [];
  let hovered: { code: string; name: string; dept: Dept | null } | null = null;
  let legend: Array<{ id: string; name: string; color: string }> = [];
  let error = '';
  let zoom = 1;
  let activeCode = selectedCode ?? '';
  let previousSelected = selectedCode;

  const width = 640;
  const height = 620;

  function colorFor(partyId: string | null | undefined): string {
    return darkPartyColor(partyId);
  }

  $: if (selectedCode !== previousSelected) {
    previousSelected = selectedCode;
    if (selectedCode) activeCode = selectedCode;
  }

  async function focusPath(code: string) {
    activeCode = code;
    await tick();
    document.getElementById(`map-path-${code}`)?.focus();
  }

  function movePath(code: string, delta: number) {
    const index = paths.findIndex((item) => item.code === code);
    if (index < 0 || paths.length === 0) return;
    const next = (index + delta + paths.length) % paths.length;
    void focusPath(paths[next].code);
  }

  function onPathKeydown(event: KeyboardEvent, code: string) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      movePath(code, 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      movePath(code, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      if (paths[0]) void focusPath(paths[0].code);
    } else if (event.key === 'End') {
      event.preventDefault();
      if (paths.at(-1)) void focusPath(paths.at(-1)!.code);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(code);
    }
  }

  function zoomBy(delta: number) {
    zoom = Math.min(2.4, Math.max(1, Number((zoom + delta).toFixed(2))));
  }

  onMount(async () => {
    try {
      const response = await fetch('/geo/departements.geojson');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const geo = await response.json();
      const geoProjection = geoConicConformal()
        .parallels([44, 49])
        .rotate([-3, 0])
        .fitSize([width - 24, height - 24], geo);
      const path = geoPath(geoProjection);

      const source = mode === 'projection' ? projection : data;
      paths = geo.features.map((feature: any) => {
        const code = String(feature.properties.code);
        const dept = source[code] ?? null;
        return {
          code,
          name: feature.properties.nom,
          d: path(feature) ?? '',
          color: colorFor(dept?.winner_party),
          margin: dept?.margin ?? 0,
          winProb: dept?.win_prob ?? 0.5,
          dept,
        };
      });

      const seen = new Map<string, { id: string; name: string; color: string }>();
      for (const dept of Object.values(source)) {
        if (!dept.winner_party || seen.has(dept.winner_party)) continue;
        const party = partyById(dept.winner_party);
        seen.set(dept.winner_party, {
          id: dept.winner_party,
          name: party?.short_name ?? dept.winner_party,
          color: colorFor(dept.winner_party),
        });
      }
      legend = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
      activeCode = selectedCode ?? paths[0]?.code ?? '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'map error';
    }
  });
</script>

<div class="relative h-full w-full min-h-0 grid-bg overflow-hidden">
  {#if error}
    <div class="absolute inset-0 flex items-center justify-center text-sm text-danger">{error}</div>
  {:else if paths.length === 0}
    <div class="absolute inset-0 flex items-center justify-center text-sm text-dim">Chargement…</div>
  {:else}
    <svg viewBox={`0 0 ${width} ${height}`} class="h-full w-full" role="group" aria-label="Carte des départements français">
      <g transform={`translate(${width * (1 - zoom) * 0.5} ${height * (1 - zoom) * 0.5}) scale(${zoom})`}>
        {#each paths as p (p.code)}
          <path
            d={p.d}
            fill={p.color}
            fill-opacity={mode === 'projection' ? 0.25 + Math.min(0.75, p.winProb) : 1}
            stroke={p.code === selectedCode ? '#35d6ff' : '#060a11'}
            stroke-width={p.code === selectedCode ? 2 : 0.8}
            id={`map-path-${p.code}`}
            class="map-path cursor-pointer transition-opacity hover:opacity-80"
            tabindex={p.code === activeCode ? 0 : -1}
            role="button"
            aria-pressed={p.code === selectedCode}
            aria-label={`${p.name}${p.dept?.winner_candidate ? ` — ${p.dept.winner_candidate}` : ''}`}
            onmouseenter={() => (hovered = p)}
            onmouseleave={() => (hovered = null)}
            onfocus={() => {
              hovered = p;
              activeCode = p.code;
            }}
            onblur={() => (hovered = null)}
            onclick={() => {
              activeCode = p.code;
              onSelect?.(p.code);
            }}
            onkeydown={(event) => onPathKeydown(event, p.code)}
          />
        {/each}
      </g>
    </svg>

    <div class="absolute left-2 top-2 border border-line bg-panel/90 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-dim backdrop-blur">
      {#if hovered}
        <span class="text-fg">{hovered.code} · {hovered.name}</span>
        {#if hovered.dept?.winner_candidate}
          <span class="text-dim"> — {hovered.dept.winner_candidate}</span>
        {:else}
          <span class="text-dim"> — {labels[lang].noData}</span>
        {/if}
      {:else}
        <span class={mode === 'projection' ? 'text-amber' : 'text-cyan'}>{mode === 'projection' ? labels[lang].projection : labels[lang].baseline}</span>
        <span class="text-dim"> / {paths.length} {labels[lang].departments}</span>
      {/if}
    </div>

    <div class="absolute right-2 top-2 flex flex-col gap-1">
      <button type="button" class="h-6 w-6 border border-line bg-panel/90 font-mono text-xs text-dim hover:text-cyan" onclick={() => zoomBy(0.2)} aria-label="Zoom in">+</button>
      <button type="button" class="h-6 w-6 border border-line bg-panel/90 font-mono text-xs text-dim hover:text-cyan" onclick={() => zoomBy(-0.2)} aria-label="Zoom out">−</button>
      <button type="button" class="h-6 w-6 border border-line bg-panel/90 font-mono text-[9px] text-dim hover:text-cyan" onclick={() => (zoom = 1)} aria-label="Reset zoom">⟲</button>
    </div>

    <div class="absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 border border-line bg-panel/85 px-2.5 py-1.5 backdrop-blur">
      {#each legend as item (item.id)}
        <span class="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-dim">
          <span class="inline-block h-2 w-2 rounded-sm" style={`background:${item.color}`}></span>
          {item.name}
        </span>
      {/each}
    </div>
  {/if}
</div>
