<script lang="ts">
  import { onMount } from 'svelte';
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
    } catch (error) {
      console.error('legislative geojson failed', error);
    } finally {
      loading = false;
    }
  });

  function select(code: string) {
    selectedCode = code;
    onSelect(code);
  }
</script>

<div class="relative h-full w-full">
  {#if loading}
    <div class="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-dim">{labels.loading}</div>
  {/if}
  <svg viewBox={`0 0 ${width} ${height}`} class="h-full w-full" role="img" aria-label={labels.map}>
    {#each paths as item (item.code)}
      <path
        d={item.d}
        fill={item.color}
        fill-opacity={0.28 + Math.min(0.72, item.winProb)}
        stroke={selectedCode === item.code ? '#f5f5f5' : '#0a0f17'}
        stroke-width={selectedCode === item.code ? 1.6 : 0.25}
        class="cursor-pointer transition-[fill-opacity] hover:fill-opacity-90"
        on:click={() => select(item.code)}
        on:keydown={(event) => event.key === 'Enter' && select(item.code)}
        role="button"
        tabindex="0"
        aria-label={`${item.name} — ${Math.round(item.winProb * 100)}%`}
      >
        <title>{item.name} · {Math.round(item.winProb * 100)} %</title>
      </path>
    {/each}
  </svg>
</div>
