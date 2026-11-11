<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { geoConicConformal, geoPath } from 'd3-geo';
  import { BLOC_META, type Bloc } from '../lib/legislative';

  interface Constituency {
    code: string;
    name: string;
    winner_bloc: Bloc;
    win_prob: number;
    margin: number;
  }

  export let constituencies: Record<string, Constituency> = {};
  export let selectedCode = '';
  export let onSelect: (code: string) => void = () => {};
  export let lang: 'fr' | 'en' | 'zh' = 'fr';

  let width = 760;
  let height = 620;
  let paths: Array<{ code: string; name: string; d: string; color: string; winProb: number; margin: number }> = [];
  let loading = true;
  let activeCode = selectedCode;
  let previousSelected = selectedCode;

  const labels = {
    fr: { loading: 'Chargement des 577 circonscriptions…', map: 'Carte des circonscriptions législatives' },
    en: { loading: 'Loading 577 constituencies…', map: 'Legislative constituencies map' },
    zh: { loading: '正在加载 577 个选区…', map: '立法选区地图' },
  }[lang];

  onMount(async () => {
    try {
      const response = await fetch('/geo/circonscriptions.geojson');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const geo = await response.json();
      // The official contour file also contains overseas and expatriate
      // constituencies. Fit the metropolitan map, and keep the seat model at 577.
      const metropolitan = {
        ...geo,
        features: geo.features.filter(
          (feature: any) => !String(feature.properties.codeDepartement ?? '').startsWith('Z'),
        ),
      };
      const projection = geoConicConformal()
        .parallels([44, 49])
        .rotate([-3, 0])
        .fitSize([width - 16, height - 16], metropolitan);
      const path = geoPath(projection);
      paths = metropolitan.features
        .map((feature: any) => {
          const code = String(feature.properties.codeCirconscription ?? feature.properties.code);
          const item = constituencies[code];
          if (!item) return null;
          return {
            code,
            name: `${feature.properties.nomCirconscription ?? ''} · ${feature.properties.nomDepartement ?? ''}`,
            d: path(feature) ?? '',
            color: BLOC_META[item.winner_bloc]?.color ?? '#9ca3af',
            winProb: item.win_prob ?? 0.5,
            margin: item.margin ?? 0,
          };
        })
        .filter((item: any): item is NonNullable<typeof item> => item !== null);
      activeCode = selectedCode || paths[0]?.code || '';
    } catch (error) {
      console.error('legislative geojson failed', error);
    } finally {
      loading = false;
    }
  });

  $: if (selectedCode !== previousSelected) {
    previousSelected = selectedCode;
    if (selectedCode) activeCode = selectedCode;
  }

  async function focusPath(code: string) {
    activeCode = code;
    await tick();
    document.getElementById(`legis-path-${code}`)?.focus();
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
      select(code);
    }
  }

  function select(code: string) {
    selectedCode = code;
    activeCode = code;
    onSelect(code);
  }
</script>

<div class="relative h-full w-full">
  {#if loading}
    <div class="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-dim">{labels.loading}</div>
  {/if}
  <svg viewBox={`0 0 ${width} ${height}`} class="h-full w-full" role="group" aria-label={labels.map}>
    {#each paths as item (item.code)}
      <path
        id={`legis-path-${item.code}`}
        d={item.d}
        fill={item.color}
        fill-opacity={0.28 + Math.min(0.72, item.winProb)}
        stroke={selectedCode === item.code ? '#f5f5f5' : '#0a0f17'}
        stroke-width={selectedCode === item.code ? 1.6 : 0.25}
        class="map-path cursor-pointer transition-[fill-opacity]"
        on:click={() => select(item.code)}
        on:focus={() => (activeCode = item.code)}
        on:keydown={(event) => onPathKeydown(event, item.code)}
        role="button"
        tabindex={item.code === activeCode ? 0 : -1}
        aria-pressed={selectedCode === item.code}
        aria-label={`${item.name} — ${Math.round(item.winProb * 100)}%`}
      >
        <title>{item.name} · {Math.round(item.winProb * 100)} %</title>
      </path>
    {/each}
  </svg>
</div>
