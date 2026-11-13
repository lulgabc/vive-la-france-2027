<script lang="ts">
  import { TOPICS } from '@vlf/domain';
  import { onMount } from 'svelte';
  import MapCanvas from './MapCanvas.svelte';
  import { darkPartyColor } from '../lib/colors';
import { avatarSrcSet } from '../lib/avatars';

  type CandidateRow = {
    id: string;
    slug: string;
    name: string;
    party: string;
    partyName: string;
    color: string;
    avatar: string;
    avatarCredit: string | null;
    avatarSource: string | null;
    status: string;
    bio: string;
    poll: number;
    pollCount: number;
    pollLast: string | null;
    market: number;
    media: number;
    social: number;
    elite: number;
    composite: number;
    isReal: boolean;
    marketAvailable: boolean;
    socialAvailable: boolean;
    eliteAvailable: boolean;
    eliteSeat: number;
    eliteParrainage: number;
    eliteParrainageTotal: number;
    eliteEndorsementCount: number;
    confidence: string;
    trend: number[];
    declaredAt: string | null;
  };

  type FeedItem = {
    id: string;
    title: string;
    canonical_url: string;
    source_name: string;
    published_at: string | null;
    topic: string | null;
    excerpt: string | null;
  };

  interface Props {
    candidates?: CandidateRow[];
    mapData?: Record<string, any>;
    projection?: Record<string, any>;
    projectionModel?: string;
    projectionNational?: Record<string, any>;
    projectionBacktest?: Record<string, any>;
    projectionUncertainty?: Record<string, any>;
    momentum?: Array<{ entity_id: string; name: string; party_id: string | null; mentions: number; share: number }>;
    feed?: FeedItem[];
    markets?: Array<Record<string, any>>;
    lang?: 'fr' | 'en' | 'zh';
    days?: number;
    stats?: { articles: number; sources: number; x: number };
    ticker?: string;
    liveUrl?: string;
    latestUpdate?: string;
    srTitle?: string;
  }

  export let candidates: CandidateRow[] = [];
  export let mapData: Record<string, any> = {};
  export let projection: Record<string, any> = {};
  export let projectionModel = '';
  export let projectionNational: Record<string, any> = {};
  export let projectionBacktest: Record<string, any> = {};
  export let projectionUncertainty: Record<string, any> = {};
  export let momentum: Array<{ entity_id: string; name: string; party_id: string | null; mentions: number; share: number }> = [];
  export let feed: FeedItem[] = [];
  export let markets: Array<Record<string, any>> = [];
  export let lang: 'fr' | 'en' | 'zh' = 'fr';
  export let days = 0;
  export let stats = { articles: 0, sources: 0, x: 25 };
  export let ticker = '';
  export let liveUrl = '';
  export let latestUpdate = '';
  export let srTitle = 'Vive la France 2027 — observatoire de la présidentielle';

  const L = {
    fr: {
      ranking: 'Classement',
      sync: 'Sync',
      dataUpdated: 'Données',
      sse: 'SSE',
      polling: '45 s',
      sortScore: 'Score',
      sortPoll: 'Sondages',
      sortMarket: 'Marchés',
      search: 'Filtrer…',
      map: 'Carte',
      baseline: '2022',
      projection: '2027',
      projectionNote: 'Scénario mécanique — swing régional hétérogène, base 2022, 500 tirages. Pas une prévision.',
      winProb: 'Probabilité de finir en tête',
      interval: 'Intervalle 80 %',
      backtest: 'Backtest géographique',
      uniform: 'swing uniforme',
      regional: 'swing régional',
      accuracy: 'précision',
      departments: 'départements',
      detail: 'Détail',
      candidate: 'Candidat',
      department: 'Département',
      score: 'Score composite',
      provisional: 'Score provisoire',
      basis: 'Sondages + marchés + médias + social + appuis',
      poll: 'Sondages',
      market: 'Marchés',
      media: 'Médias',
      social: 'Social',
      elite: 'Signaux politiques',
      parrainage2022: 'Parrainages 2022',
      confidence: 'Confiance',
      trend: 'Tendance 12 semaines',
      trendReal: 'Tendance (sondages + marchés)',
      bio: 'Biographie',
      openProfile: 'Ouvrir la fiche',
      openMap: 'Ouvrir la carte',
      openLegislative: 'Scénario législatif',
      momentum: 'Momentum média',
      feed: 'Flux',
      markets: 'Marchés',
      allSources: 'Toutes sources',
      allTopics: 'Tous thèmes',
      noMarkets: 'Aucun marché France 2027 ingéré.',
      noFeed: 'Aucun article pour ces filtres.',
      winner: 'Arrivé en tête',
      turnout: 'Participation',
      topResults: 'Top résultats',
      noData: 'Pas de données',
      articles: 'articles',
      sources: 'sources',
      live: 'LIVE',
      selectCandidate: 'Sélectionner un candidat',
      selectDepartment: 'Sélectionner un département',
      platforms: 'Connecteurs',
      active: 'actifs',
      waiting: 'en attente',
      weights: 'Poids',
      resetWeights: 'Défaut',
    },
    en: {
      ranking: 'Ranking',
      sync: 'Sync',
      dataUpdated: 'Data',
      sse: 'SSE',
      polling: '45 s',
      sortScore: 'Score',
      sortPoll: 'Polls',
      sortMarket: 'Markets',
      search: 'Filter…',
      map: 'Map',
      baseline: '2022',
      projection: '2027',
      projectionNote: 'Mechanical scenario — heterogeneous regional swing, 2022 baseline, 500 draws. Not a forecast.',
      winProb: 'Probability of leading',
      interval: '80% interval',
      backtest: 'Geographic backtest',
      uniform: 'uniform swing',
      regional: 'regional swing',
      accuracy: 'accuracy',
      departments: 'departments',
      detail: 'Detail',
      candidate: 'Candidate',
      department: 'Department',
      score: 'Composite score',
      provisional: 'Provisional score',
      basis: 'Polls + markets + media + social + endorsements',
      poll: 'Polls',
      market: 'Markets',
      media: 'Media',
      social: 'Social',
      elite: 'Political signals',
      parrainage2022: '2022 parrainages',
      confidence: 'Confidence',
      trend: '12-week trend',
      trendReal: 'Trend (polls + markets)',
      bio: 'Biography',
      openProfile: 'Open profile',
      openMap: 'Open map',
      openLegislative: 'Legislative scenario',
      momentum: 'Media momentum',
      feed: 'Feed',
      markets: 'Markets',
      allSources: 'All sources',
      allTopics: 'All topics',
      noMarkets: 'No France 2027 market ingested.',
      noFeed: 'No article matches these filters.',
      winner: 'First place',
      turnout: 'Turnout',
      topResults: 'Top results',
      noData: 'No data',
      articles: 'articles',
      sources: 'sources',
      live: 'LIVE',
      selectCandidate: 'Select a candidate',
      selectDepartment: 'Select a department',
      platforms: 'Connectors',
      active: 'active',
      waiting: 'waiting',
      weights: 'Weights',
      resetWeights: 'Reset',
    },
    zh: {
      ranking: '排名',
      sync: '同步',
      dataUpdated: '数据',
      sse: 'SSE',
      polling: '45 秒',
      sortScore: '评分',
      sortPoll: '民调',
      sortMarket: '市场',
      search: '筛选…',
      map: '地图',
      baseline: '2022',
      projection: '2027',
      projectionNote: '机械情景 — 区域异质摆动，2022 基线，500 次抽样。不是预测。',
      winProb: '领先概率',
      interval: '80% 区间',
      backtest: '地理回测',
      uniform: '统一摆动',
      regional: '区域摆动',
      accuracy: '准确率',
      departments: '个省',
      detail: '详情',
      candidate: '候选人',
      department: '省份',
      score: '综合评分',
      provisional: '临时评分',
      basis: '民调 + 市场 + 媒体 + 社交 + 政治支持',
      poll: '民调',
      market: '市场',
      media: '媒体',
      social: '社交',
      elite: '政治信号',
      parrainage2022: '2022 签名',
      confidence: '置信度',
      trend: '12 周趋势',
      trendReal: '趋势（民调 + 市场）',
      bio: '传记',
      openProfile: '打开档案',
      openMap: '打开地图',
      openLegislative: '立法情景',
      momentum: '媒体热度',
      feed: '信息流',
      markets: '预测市场',
      allSources: '全部来源',
      allTopics: '全部议题',
      noMarkets: '尚未采集到法国 2027 市场。',
      noFeed: '没有符合筛选条件的文章。',
      winner: '领先',
      turnout: '投票率',
      topResults: '主要结果',
      noData: '暂无数据',
      articles: '篇文章',
      sources: '个来源',
      live: '实时',
      selectCandidate: '选择候选人',
      selectDepartment: '选择省份',
      platforms: '连接器',
      active: '已启用',
      waiting: '等待中',
      weights: '权重',
      resetWeights: '默认',
    },
  }[lang];

  const locale = lang === 'zh' ? 'zh-CN' : lang === 'en' ? 'en-GB' : 'fr-FR';
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat(locale);

  let sort: 'composite' | 'poll' | 'market' = 'composite';
  let query = '';
  let selectedId = candidates[0]?.id ?? null;
  let selectedDept = '75';
  let detailMode: 'candidate' | 'department' = 'candidate';
  let mapMode: 'baseline' | 'projection' = 'baseline';
  let feedSource = '';
  let feedTopic = '';
  let clock = '';
  let showWeights = false;
  let useCustomWeights = false;
  let hydrated = false;
  let syncedAt = '';
  let liveMode: 'sse' | 'poll' | 'off' = 'off';
  let syncing = false;
  let lastRefresh = 0;
  let liveEvents = 0;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let refreshPending = false;
  let eventSource: EventSource | null = null;
  let wPoll = 40;
  let wMarket = 20;
  let wMedia = 15;
  let wSocial = 10;
  let wElite = 15;

  $: totalWeights = wPoll + wMarket + wMedia + wSocial + wElite || 1;
  $: maxPoll = Math.max(1, ...candidates.map((candidate) => candidate.poll));
  $: maxMedia = Math.max(0.01, ...candidates.map((candidate) => candidate.media));
  $: maxSocial = Math.max(0.01, ...candidates.map((candidate) => candidate.social));
  $: scoredCandidates = candidates.map((candidate) => {
    const weighted =
      (wPoll * ((candidate.poll / maxPoll) * 100) +
        wMarket * (candidate.market * 100) +
        wMedia * ((candidate.media / maxMedia) * 100) +
        wSocial * ((candidate.social / maxSocial) * 100) +
        wElite * (candidate.elite * 100)) /
      totalWeights;
    return { ...candidate, display: useCustomWeights ? weighted : candidate.composite };
  });

  $: sorted = [...scoredCandidates].sort((a, b) => {
    if (sort === 'poll') return b.poll - a.poll;
    if (sort === 'market') return b.market - a.market;
    return b.display - a.display;
  });

  $: filteredCandidates = sorted.filter((candidate) => {
    if (!query) return true;
    const text = `${candidate.name} ${candidate.partyName}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  $: selected = scoredCandidates.find((candidate) => candidate.id === selectedId) ?? filteredCandidates[0] ?? scoredCandidates[0];
  $: dept = selectedDept ? (mapMode === 'projection' ? projection[selectedDept] : mapData[selectedDept]) : null;
  $: feedSources = [...new Set(feed.map((article) => article.source_name))].sort();
  $: feedTopics = [...new Set(feed.map((article) => article.topic).filter(Boolean))] as string[];
  $: filteredFeed = feed
    .filter((article) => {
      if (feedSource && article.source_name !== feedSource) return false;
      if (feedTopic && article.topic !== feedTopic) return false;
      if (query && !article.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    })
    .slice(0, 80);
  $: maxMomentum = Math.max(1, ...momentum.map((item) => item.mentions));
  $: topMomentum = momentum.slice(0, 8);

  function applyScores(rows: any[]) {
    const map = new Map(rows.map((row) => [row.entity_id, row]));
    candidates = candidates.map((candidate) => {
      const row = map.get(candidate.id);
      if (!row) return candidate;
      let components: any = {};
      try {
        components = JSON.parse(row.components_json ?? '{}');
      } catch {
        components = {};
      }
      return {
        ...candidate,
        poll: Number(row.poll_avg ?? candidate.poll),
        market: Number(row.market_prob ?? candidate.market ?? 0),
        media: Number(row.share_of_voice ?? candidate.media ?? 0),
        social: Number(row.social_attention ?? candidate.social ?? 0),
        elite: Number(components.elite ?? candidate.elite ?? 0),
        composite: Number(row.composite ?? candidate.composite),
        isReal: components.demo === false,
        marketAvailable: components.market !== null && components.market !== undefined,
        socialAvailable: components.social !== null && components.social !== undefined,
        eliteAvailable: components.elite !== null && components.elite !== undefined,
        confidence: row.confidence ?? candidate.confidence,
        pollCount: Number(components.poll_n ?? candidate.pollCount),
      };
    });
  }

  function applyFeed(rows: any[]) {
    feed = rows.map((row) => ({
      id: row.id,
      title: row.title,
      canonical_url: row.canonical_url,
      source_name: row.source_name,
      published_at: row.published_at,
      topic: row.topic ?? null,
      excerpt: row.excerpt ?? null,
    }));
  }

  function applyMarkets(rows: any[]) {
    markets = rows;
  }

  function applyMomentum(rows: any[]) {
    momentum = rows;
  }

  async function refreshData() {
    if (syncing || typeof window === 'undefined') return;
    if (document.visibilityState === 'hidden') return;
    syncing = true;
    try {
      const [feedResponse, scoresResponse, marketsResponse, momentumResponse, versionResponse] = await Promise.all([
        fetch('/api/v1/feed?limit=60', { cache: 'no-store' }),
        fetch('/api/v1/scores', { cache: 'no-store' }),
        fetch('/api/v1/markets', { cache: 'no-store' }),
        fetch('/api/v1/momentum?limit=12', { cache: 'no-store' }),
        fetch('/api/v1/version', { cache: 'no-store' }),
      ]);
      if (feedResponse.ok) applyFeed(((await feedResponse.json()) as any).data ?? []);
      if (scoresResponse.ok) applyScores(((await scoresResponse.json()) as any).data ?? []);
      if (marketsResponse.ok) applyMarkets(((await marketsResponse.json()) as any).data ?? []);
      if (momentumResponse.ok) applyMomentum(((await momentumResponse.json()) as any).data ?? []);
      if (versionResponse.ok) latestUpdate = ((await versionResponse.json()) as any).updated_at ?? latestUpdate;
      syncedAt = new Intl.DateTimeFormat(locale, {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());
    } catch {
      // Keep the last rendered values if the network is temporarily unavailable.
    } finally {
      syncing = false;
    }
  }

  function scheduleRefresh() {
    const now = Date.now();
    const wait = 5000 - (now - lastRefresh);
    if (wait > 0) {
      if (!refreshPending) {
        refreshPending = true;
        refreshTimeout = setTimeout(() => {
          refreshPending = false;
          refreshTimeout = null;
          lastRefresh = Date.now();
          void refreshData();
        }, wait);
      }
      return;
    }
    lastRefresh = now;
    void refreshData();
  }

  function startLive() {
    const url =
      liveUrl ||
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://127.0.0.1:8787/live'
        : '');
    if (url && typeof EventSource !== 'undefined') {
      try {
        eventSource = new EventSource(url);
        eventSource.onopen = () => {
          liveMode = 'sse';
        };
        const onLiveEvent = () => {
          liveEvents += 1;
          scheduleRefresh();
        };
        for (const type of ['articles', 'social', 'scores', 'markets', 'judgment', 'forecasts', 'hello', 'message']) {
          eventSource.addEventListener(type, onLiveEvent);
        }
        eventSource.onerror = () => {
          liveMode = 'poll';
        };
      } catch {
        liveMode = 'poll';
      }
    } else {
      liveMode = 'poll';
    }
    refreshTimer = setInterval(() => void refreshData(), 45_000);
    void refreshData();
  }

  onMount(() => {
    const fmt = new Intl.DateTimeFormat(locale, {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const update = () => (clock = fmt.format(new Date()));
    update();
    const id = setInterval(update, 1000);

    const raw =
      new URLSearchParams(window.location.search).get('w') ?? localStorage.getItem('vlf:weights');
    if (raw) {
      try {
        const values = raw.startsWith('[') ? JSON.parse(raw) : raw.split(',').map(Number);
        if (
          Array.isArray(values) &&
          values.length === 5 &&
          values.every((value) => Number.isFinite(value) && value >= 0)
        ) {
          [wPoll, wMarket, wMedia, wSocial, wElite] = values;
          useCustomWeights = values.some((value, index) => value !== [40, 20, 15, 10, 15][index]);
        }
      } catch {
        // Ignore malformed stored weights.
      }
    }
    hydrated = true;
    startLive();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshData();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      if (refreshTimer) clearInterval(refreshTimer);
      if (refreshTimeout) clearTimeout(refreshTimeout);
      if (eventSource) eventSource.close();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });

  $: if (hydrated && useCustomWeights) persistWeights(wPoll, wMarket, wMedia, wSocial, wElite);

  function persistWeights(poll: number, market: number, media: number, social: number, elite: number) {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('w', [poll, market, media, social, elite].join(','));
    history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    localStorage.setItem('vlf:weights', JSON.stringify([poll, market, media, social, elite]));
  }

  function resetWeights() {
    wPoll = 40;
    wMarket = 20;
    wMedia = 15;
    wSocial = 10;
    wElite = 15;
    useCustomWeights = false;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.delete('w');
      const query = params.toString();
      history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
      localStorage.removeItem('vlf:weights');
    }
  }

  function pct(value: number, digits = 1): string {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} %`;
  }

  function time(value: string | null): string {
    if (!value) return '--:--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--:--';
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function updatedAt(value: string): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'Europe/Paris',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }

  function topicLabel(id: string | null): string {
    if (!id) return '—';
    return TOPICS.find((topic) => topic.id === id)?.[lang] ?? id;
  }

  function sparkPoints(values: number[], width = 120, height = 28): string {
    if (!values.length) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - 2 - ((value - min) / span) * (height - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  function candidateUrl(slug: string): string {
    if (lang === 'fr') return `/candidats/${slug}`;
    if (lang === 'en') return `/en/candidates/${slug}`;
    return `/zh/candidates/${slug}`;
  }

  function selectCandidate(id: string) {
    selectedId = id;
    detailMode = 'candidate';
  }

  function selectDepartment(code: string) {
    selectedDept = code;
    detailMode = 'department';
  }

  function selectMomentum(entityId: string) {
    if (candidates.some((candidate) => candidate.id === entityId)) selectCandidate(entityId);
  }

  function normalized(value: number, max: number): number {
    return Math.max(3, Math.min(100, (value / max) * 100));
  }
</script>

<h1 class="sr-only">{srTitle}</h1>

<div class="dash">
  <div class="dash-top">
    <section class="panel">
      <div class="panel-head">
        <div class="flex items-center gap-2">
          <div class="panel-title">{L.ranking}</div>
          <span
            class:list={['shrink-0 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.06em]', liveMode === 'sse' ? 'text-ok' : 'text-amber/80']}
            title={`${liveMode === 'sse' ? L.sse : L.polling} · ${L.sync} ${syncedAt || '—'} · ${liveEvents}`}
          >●</span>
        </div>
        <div class="flex items-center gap-1 font-mono text-[9px]">
          <button type="button" class={['px-1.5 py-0.5 border', sort === 'composite' ? 'border-cyan text-cyan' : 'border-line text-dim hover:text-fg'].join(' ')} aria-pressed={sort === 'composite'} on:click={() => (sort = 'composite')}>{L.sortScore}</button>
          <button type="button" class={['px-1.5 py-0.5 border', sort === 'poll' ? 'border-cyan text-cyan' : 'border-line text-dim hover:text-fg'].join(' ')} aria-pressed={sort === 'poll'} on:click={() => (sort = 'poll')}>{L.sortPoll}</button>
          <button type="button" class={['px-1.5 py-0.5 border', sort === 'market' ? 'border-cyan text-cyan' : 'border-line text-dim hover:text-fg'].join(' ')} aria-pressed={sort === 'market'} on:click={() => (sort = 'market')}>{L.sortMarket}</button>
          <button type="button" class={['px-1.5 py-0.5 border', showWeights ? 'border-amber text-amber' : 'border-line text-dim hover:text-fg'].join(' ')} on:click={() => (showWeights = !showWeights)} title={L.weights}>⚙</button>
        </div>
      </div>
      <div class="px-2 py-1.5 border-b border-line">
        <label for="candidate-filter" class="sr-only">{L.search}</label>
        <input
          id="candidate-filter"
          bind:value={query}
          placeholder={L.search}
          class="w-full bg-panel2 border border-line-strong px-2 py-1 font-mono text-[10px] text-fg placeholder:text-dim focus:outline-none focus:border-cyan/60"
        />
        <div class="mt-1 flex items-center justify-between gap-2 font-mono text-[8px] text-dim">
          <span class="truncate">{L.dataUpdated} {updatedAt(latestUpdate)}</span>
          <span class="shrink-0">{liveMode === 'sse' ? L.sse : L.polling} · {syncedAt || '—'}</span>
        </div>
      </div>
      {#if showWeights}
        <div class="px-2 py-1.5 border-b border-line bg-panel2/50">
          <div class="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-dim">
            <span>{L.weights} · Σ {totalWeights}</span>
            <button type="button" class="text-amber hover:text-fg" on:click={resetWeights}>{L.resetWeights}</button>
          </div>
          {#each [
            { label: L.poll, bind: 'poll' },
            { label: L.market, bind: 'market' },
            { label: L.media, bind: 'media' },
            { label: L.social, bind: 'social' },
            { label: L.elite, bind: 'elite' },
          ] as item}
            <div class="mt-1.5 flex items-center gap-2 font-mono text-[9px] text-dim">
              <label for={`weight-${item.bind}`} class="w-14 shrink-0 truncate">{item.label}</label>
              {#if item.bind === 'poll'}
                <input id="weight-poll" aria-label={item.label} class="w-full accent-[#4f7cff]" type="range" min="0" max="100" step="1" bind:value={wPoll} on:input={() => (useCustomWeights = true)} />
                <span class="w-6 text-right text-fg">{wPoll}</span>
              {:else if item.bind === 'market'}
                <input id="weight-market" aria-label={item.label} class="w-full accent-[#39d98a]" type="range" min="0" max="100" step="1" bind:value={wMarket} on:input={() => (useCustomWeights = true)} />
                <span class="w-6 text-right text-fg">{wMarket}</span>
              {:else if item.bind === 'media'}
                <input id="weight-media" aria-label={item.label} class="w-full accent-[#ff4d6d]" type="range" min="0" max="100" step="1" bind:value={wMedia} on:input={() => (useCustomWeights = true)} />
                <span class="w-6 text-right text-fg">{wMedia}</span>
              {:else if item.bind === 'social'}
                <input id="weight-social" aria-label={item.label} class="w-full accent-[#b388ff]" type="range" min="0" max="100" step="1" bind:value={wSocial} on:input={() => (useCustomWeights = true)} />
                <span class="w-6 text-right text-fg">{wSocial}</span>
              {:else}
                <input id="weight-elite" aria-label={item.label} class="w-full accent-[#ffb020]" type="range" min="0" max="100" step="1" bind:value={wElite} on:input={() => (useCustomWeights = true)} />
                <span class="w-6 text-right text-fg">{wElite}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      <div class="panel-body scroll-thin">
        {#each filteredCandidates as candidate, index (candidate.id)}
          <button
            type="button"
            class={[
              'w-full text-left px-2 py-1.5 border-b border-line/60 hover:bg-white/[0.03] transition-colors',
              selected?.id === candidate.id ? 'bg-cyan/5' : '',
            ].join(' ')}
            on:click={() => selectCandidate(candidate.id)}
          >
            <div class="flex items-center gap-2">
              <span class="w-4 text-right font-mono text-[9px] text-dim">{index + 1}</span>
              <img src={candidate.avatar} srcset={avatarSrcSet(candidate.avatar)} sizes="28px" width="28" height="28" alt="" class="h-7 w-7 rounded-full shrink-0 border border-line object-cover" loading={index < 8 ? 'eager' : 'lazy'} decoding="async" />
              <span class="flex-1 min-w-0">
                <span class="block truncate text-[12px] text-fg">{candidate.name}</span>
                <span class="block font-mono text-[9px] uppercase tracking-[0.08em] text-dim">{candidate.party}</span>
              </span>
              <span class="font-mono text-[13px] font-bold text-cyan tabular-nums">{Math.round(candidate.display)}</span>
            </div>
            <div class="mt-1 flex items-center justify-between gap-2 font-mono text-[9px] text-dim">
              <span>P {pct(candidate.poll)}</span>
              <span>M {candidate.marketAvailable ? `${Math.round(candidate.market * 100)}%` : '—'}</span>
              {#if candidate.trend.length > 1}
                <svg viewBox="0 0 64 14" width="64" height="14" class="opacity-80" aria-hidden="true">
                  <polyline points={sparkPoints(candidate.trend, 64, 14)} fill="none" stroke={candidate.color} stroke-width="1.2" stroke-linejoin="round" />
                </svg>
              {/if}
            </div>
          </button>
        {:else}
          <div class="p-4 text-[11px] text-dim">{L.selectCandidate}</div>
        {/each}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div class="flex items-center gap-2">
          <div class="panel-title">{L.map}</div>
          <span class="font-mono text-[9px] text-dim">/ {Object.keys(mapData).length} {L.departments}</span>
        </div>
        <div class="flex items-center gap-1 font-mono text-[9px]">
          <button type="button" class={['border px-1.5 py-0.5', mapMode === 'baseline' ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-line text-dim hover:text-fg'].join(' ')} aria-pressed={mapMode === 'baseline'} on:click={() => (mapMode = 'baseline')}>{L.baseline}</button>
          <button type="button" class={['border px-1.5 py-0.5', mapMode === 'projection' ? 'border-amber/50 bg-amber/10 text-amber' : 'border-line text-dim hover:text-fg'].join(' ')} aria-pressed={mapMode === 'projection'} on:click={() => { mapMode = 'projection'; detailMode = 'department'; }}>{L.projection}</button>
          <span class="ml-2 text-dim">J-{days}</span>
        </div>
      </div>
      <div class="flex-1 min-h-0">
        {#key mapMode}
          <MapCanvas data={mapData} {projection} mode={mapMode} {lang} selectedCode={selectedDept} onSelect={selectDepartment} />
        {/key}
      </div>
      <div class="ticker border-t border-line px-3 py-1.5">
        <div class="ticker-track font-mono text-[10px] text-dim">
          {#each [0, 1] as copy (copy)}
            <span class="inline-flex items-center gap-3">
              <span class="text-cyan">{L.live}</span>
              <span>{ticker || '—'}</span>
              <span class="text-line">///</span>
              <span>{integer.format(stats.articles)} {L.articles}</span>
              <span class="text-line">///</span>
              <span>{stats.sources} {L.sources}</span>
              <span class="text-line">///</span>
            </span>
          {/each}
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">{L.detail}</div>
        <div class="flex items-center gap-1 font-mono text-[9px]">
          <button type="button" class={['px-1.5 py-0.5 border', detailMode === 'candidate' ? 'border-cyan text-cyan' : 'border-line text-dim'].join(' ')} aria-pressed={detailMode === 'candidate'} on:click={() => (detailMode = 'candidate')}>{L.candidate}</button>
          <button type="button" class={['px-1.5 py-0.5 border', detailMode === 'department' ? 'border-cyan text-cyan' : 'border-line text-dim'].join(' ')} aria-pressed={detailMode === 'department'} on:click={() => (detailMode = 'department')}>{L.department}</button>
        </div>
      </div>
      <div class="panel-body scroll-thin">
        {#if detailMode === 'candidate' && selected}
          <div class="p-3">
            <div class="flex items-center gap-3">
              <img src={selected.avatar} srcset={avatarSrcSet(selected.avatar)} sizes="48px" width="48" height="48" alt="" class="h-12 w-12 rounded-full border border-line object-cover" decoding="async" />
              <div class="min-w-0">
                <div class="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em]">
                  <span class="h-2 w-2 rounded-full" style={`background:${selected.color}`}></span>
                  <span style={`color:${selected.color}`}>{selected.partyName}</span>
                  <span class="text-dim">/ {selected.status}</span>
                </div>
                <h2 class="mt-1 font-display text-2xl leading-tight text-fg">{selected.name}</h2>
              </div>
            </div>
            <div class="mt-3 flex items-end justify-between border-y border-line py-3">
              <div>
                <div class="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{selected.isReal ? L.provisional : L.score}</div>
                <div class="font-mono text-5xl leading-none font-bold text-cyan">{Math.round(selected.display)}</div>
                {#if selected.isReal}<div class="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-dim">{L.basis}</div>{/if}
              </div>
              <div class="shrink-0 pl-2 text-right font-mono text-[10px] text-dim">
                <div>{L.confidence}</div>
                <div class="mt-1 text-fg uppercase">{selected.confidence}</div>
              </div>
            </div>
            <div class="mt-3 space-y-2">
              {#each [
                { key: L.poll, value: selected.poll, max: 40, display: pct(selected.poll), color: '#4f7cff', available: true },
                { key: L.market, value: selected.market * 100, max: 100, display: selected.marketAvailable ? `${Math.round(selected.market * 100)} %` : '—', color: '#39d98a', available: selected.marketAvailable },
                { key: L.media, value: selected.media, max: 0.35, display: pct(selected.media * 100, 0), color: '#ff4d6d', available: true },
                { key: L.social, value: selected.social, max: 0.35, display: selected.socialAvailable ? pct(selected.social * 100, 0) : '—', color: '#b388ff', available: selected.socialAvailable },
                { key: L.elite, value: selected.elite, max: 1, display: selected.eliteAvailable ? pct(selected.elite * 100, 0) : '—', color: '#ffb020', available: selected.eliteAvailable },
              ] as component}
                <div>
                  <div class="flex justify-between font-mono text-[9px] text-dim">
                    <span>{component.key}</span>
                    <span class="text-fg">{component.display}</span>
                  </div>
                  <div class="mt-1 h-1.5 bg-panel2">
                    <div class="h-full" style={`width:${component.available ? normalized(component.value, component.max) : 0}%; background:${component.color}`}></div>
                  </div>
                </div>
              {/each}
              {#if selected.isReal && selected.eliteParrainageTotal > 0}
                <div class="flex justify-between font-mono text-[10px] text-dim">
                  <span>{L.parrainage2022}</span>
                  <span>{selected.eliteParrainageTotal} · {Math.round(selected.eliteParrainage * 100)} %</span>
                </div>
              {/if}
            </div>
            {#if selected.trend.length > 1}
              <div class="mt-4">
                <div class="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{selected.isReal ? L.trendReal : L.trend}</div>
                <svg viewBox="0 0 280 44" class="mt-1 h-12 w-full" aria-hidden="true">
                  <polyline points={sparkPoints(selected.trend, 280, 44)} fill="none" stroke={selected.color} stroke-width="1.6" stroke-linejoin="round" />
                </svg>
              </div>
            {/if}
            {#if selected.pollCount > 0}
              <p class="mt-2 font-mono text-[9px] uppercase tracking-[0.08em] text-dim">
                {L.poll} · n={selected.pollCount}{selected.pollLast ? ` · ${selected.pollLast}` : ''}
              </p>
            {/if}
            <p class="mt-3 text-[11px] leading-relaxed text-dim">{selected.bio}</p>
            {#if selected.avatarSource}
              <a href={selected.avatarSource} target="_blank" rel="noopener noreferrer" class="mt-2 block font-mono text-[10px] text-dim hover:text-cyan">
                Photo : {selected.avatarCredit} · Wikimedia Commons
              </a>
            {/if}
            <a href={candidateUrl(selected.slug)} class="mt-3 inline-flex border border-line px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-dim hover:border-cyan hover:text-cyan">
              {L.openProfile} ↗
            </a>
          </div>
        {:else if detailMode === 'department' && dept}
          <div class="p-3">
            <div class="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">{dept.code} · {dept.region}</div>
            <h2 class="mt-1 font-display text-2xl text-fg">{dept.name}</h2>
            <div class="mt-3 border-y border-line py-3">
              <div class="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{L.winner}{mapMode === 'projection' ? ' · SCÉNARIO' : ''}</div>
              <div class="mt-1 flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" style={`background:${darkPartyColor(dept.winner_party)}`}></span>
                <span class="text-sm text-fg">{mapMode === 'projection' && dept.shares?.[0] ? (lang === 'zh' ? dept.shares[0].name_zh : lang === 'en' ? dept.shares[0].name_en : dept.shares[0].name_fr) : dept.winner_candidate}</span>
                <span class="ml-auto font-mono text-xl font-bold text-cyan">{pct(dept.winner_pct)}</span>
              </div>
              {#if mapMode === 'projection'}
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
              {/if}
              {#if mapMode !== 'projection' && typeof dept.turnout === 'number'}
                <div class="mt-2 flex justify-between font-mono text-[9px] text-dim">
                  <span>{L.turnout}</span>
                  <span class="text-fg">{pct(dept.turnout)}</span>
                </div>
              {/if}
            </div>
            <div class="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-dim">
              <span>{L.topResults}</span>
              <span class={mapMode === 'projection' ? 'text-amber' : 'text-dim'}>{mapMode === 'projection' ? 'SCÉNARIO 2027' : '2022'}</span>
            </div>
            <div class="mt-2 space-y-1.5">
              {#if mapMode === 'projection'}
                {#each dept.shares.slice(0, 6) as result}
                  <div class="grid grid-cols-[1fr_3rem] items-center gap-2">
                    <div class="min-w-0">
                      <div class="flex justify-between font-mono text-[10px]">
                        <span class="truncate text-fg">{lang === 'zh' ? result.name_zh : lang === 'en' ? result.name_en : result.name_fr}</span>
                        <span class="text-dim">{pct(result.pct)}</span>
                      </div>
                      <div class="mt-0.5 h-1 bg-panel2">
                        <div class="h-full" style={`width:${Math.max(3, result.pct)}%; background:${darkPartyColor(result.party_id)}`}></div>
                      </div>
                    </div>
                  </div>
                {/each}
              {:else}
                {#each dept.results.slice(0, 6) as result}
                  <div class="grid grid-cols-[1fr_3rem] items-center gap-2">
                    <div class="min-w-0">
                      <div class="flex justify-between font-mono text-[10px]">
                        <span class="truncate text-fg">{result.candidate}</span>
                        <span class="text-dim">{pct(result.pct)}</span>
                      </div>
                      <div class="mt-0.5 h-1 bg-panel2">
                        <div class="h-full" style={`width:${Math.max(3, result.pct)}%; background:${darkPartyColor(result.party_id)}`}></div>
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
            {#if mapMode === 'projection'}
              <p class="mt-3 border-t border-line pt-2 font-mono text-[8px] leading-relaxed text-amber/80">{L.projectionNote}</p>
              {#if projectionBacktest?.departments}
                <p class="mt-1 font-mono text-[8px] leading-relaxed text-dim">
                  {L.backtest} {projectionBacktest.baseline_year}→{projectionBacktest.target_year} · {L.uniform} {Math.round((projectionBacktest.uniform_accuracy ?? 0) * 100)}% · {L.regional} {Math.round((projectionBacktest.regional_accuracy ?? 0) * 100)}% {L.accuracy} · n={projectionBacktest.departments}
                </p>
              {/if}
            {/if}
            <div class="mt-3 flex flex-wrap gap-2">
              <a href={lang === 'fr' ? '/carte' : lang === 'en' ? '/en/map' : '/zh/map'} class="inline-flex border border-line px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-dim hover:border-cyan hover:text-cyan">
                {L.openMap} ↗
              </a>
              <a href={lang === 'fr' ? '/legislatives' : lang === 'en' ? '/en/legislative' : '/zh/legislative'} class="inline-flex border border-line px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-dim hover:border-amber hover:text-amber">
                {L.openLegislative} ↗
              </a>
            </div>
          </div>
        {:else}
          <div class="p-4 text-[11px] text-dim">{L.selectCandidate}</div>
        {/if}
      </div>
    </section>
  </div>

  <div class="dash-bottom">
    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">{L.momentum}</div>
        <span class="font-mono text-[9px] text-dim">7J</span>
      </div>
      <div class="panel-body scroll-thin p-2">
        {#if topMomentum.length === 0}
          <div class="p-2 text-[11px] text-dim">{L.noData}</div>
        {:else}
          {#each topMomentum as item, index (item.entity_id)}
            <button type="button" class="w-full text-left py-1 hover:bg-white/[0.03]" on:click={() => selectMomentum(item.entity_id)}>
              <div class="flex items-center gap-2 font-mono text-[10px]">
                <span class="w-3 text-right text-dim">{index + 1}</span>
                <span class="h-2 w-2 rounded-full" style={`background:${darkPartyColor(item.party_id)}`}></span>
                <span class="flex-1 truncate text-fg">{item.name}</span>
                <span class="text-cyan tabular-nums">{item.mentions}</span>
              </div>
              <div class="mt-1 ml-5 h-1 bg-panel2">
                <div class="h-full" style={`width:${normalized(item.mentions, maxMomentum)}%; background:${darkPartyColor(item.party_id)}`}></div>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div class="flex items-center gap-2">
          <div class="panel-title">{L.feed}</div>
          <span class="font-mono text-[9px] text-dim">/ {filteredFeed.length}</span>
        </div>
        <div class="flex items-center gap-1">
          <select bind:value={feedSource} aria-label={L.allSources} class="bg-panel2 border border-line px-1.5 py-0.5 font-mono text-[9px] text-dim focus:outline-none">
            <option value="">{L.allSources}</option>
            {#each feedSources as source}
              <option value={source}>{source}</option>
            {/each}
          </select>
          <select bind:value={feedTopic} aria-label={L.allTopics} class="bg-panel2 border border-line px-1.5 py-0.5 font-mono text-[9px] text-dim focus:outline-none">
            <option value="">{L.allTopics}</option>
            {#each feedTopics as topic}
              <option value={topic}>{topicLabel(topic)}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="panel-body scroll-thin">
        {#each filteredFeed as article (article.id)}
          <a
            href={article.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
            class="grid grid-cols-[42px_1fr_96px] gap-2 px-2 py-1.5 border-b border-line/60 hover:bg-white/[0.03] transition-colors"
          >
            <span class="font-mono text-[9px] text-dim tabular-nums">{time(article.published_at)}</span>
            <span class="min-w-0">
              <span class="block truncate text-[11px] text-fg">{article.title}</span>
              <span class="block font-mono text-[9px] text-dim">{article.source_name}</span>
            </span>
            <span class="truncate font-mono text-[9px] uppercase tracking-[0.04em] text-dim">{topicLabel(article.topic)}</span>
          </a>
        {:else}
          <div class="p-4 text-[11px] text-dim">{L.noFeed}</div>
        {/each}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">{L.markets}</div>
        <span class="font-mono text-[9px] text-dim">{markets.length ? markets.length : '0 / 3'}</span>
      </div>
      <div class="panel-body scroll-thin">
        {#if markets.length === 0}
          <div class="p-3">
            <p class="text-[11px] leading-relaxed text-dim">{L.noMarkets}</p>
            <div class="mt-3 space-y-1.5 font-mono text-[9px]">
              <div class="flex items-center justify-between border border-line px-2 py-1"><span class="text-fg">KALSHI</span><span class="text-ok">{L.active}</span></div>
              <div class="flex items-center justify-between border border-line px-2 py-1"><span class="text-fg">POLYMARKET</span><span class="text-amber">{L.waiting}</span></div>
              <div class="flex items-center justify-between border border-line px-2 py-1"><span class="text-fg">METACULUS</span><span class="text-dim">{L.waiting}</span></div>
            </div>
          </div>
        {:else}
          {#each markets as market}
            <a href={market.source_url ?? '#'} target="_blank" rel="noopener noreferrer" class="block px-2 py-1.5 border-b border-line/60 hover:bg-white/[0.03]">
              <div class="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.08em] text-dim">
                <span>{market.platform}</span>
                <span class="text-cyan">{typeof market.implied_prob === 'number' ? `${Math.round(market.implied_prob * 100)} %` : '—'}</span>
              </div>
              <div class="mt-1 flex items-center justify-between gap-2">
                <span class="min-w-0 flex-1 text-[11px] leading-snug text-fg">{market.question}</span>
                {#if market.history?.length > 1}
                  <svg viewBox="0 0 64 14" class="h-3.5 w-16 shrink-0" aria-hidden="true">
                    <polyline fill="none" stroke="#39d98a" stroke-width="1.2" points={sparkPoints(market.history.map((point: any) => point.prob), 64, 14)} />
                  </svg>
                {/if}
              </div>
              {#if typeof market.change_7d === 'number'}
                <div class="mt-0.5 font-mono text-[10px] text-dim">7j {market.change_7d > 0 ? '+' : ''}{(market.change_7d * 100).toFixed(1)} pts</div>
              {/if}
            </a>
          {/each}
        {/if}
      </div>
    </section>
  </div>
</div>
