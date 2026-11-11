import type { Lang } from './ui';

type RouteName =
  | 'home'
  | 'map'
  | 'legislative'
  | 'forecasts'
  | 'polls'
  | 'markets'
  | 'candidates'
  | 'feed'
  | 'methodology'
  | 'about';

const paths: Record<RouteName, Record<Lang, string>> = {
  home: { fr: '/', en: '/en', zh: '/zh' },
  map: { fr: '/carte', en: '/en/map', zh: '/zh/map' },
  legislative: { fr: '/legislatives', en: '/en/legislative', zh: '/zh/legislative' },
  forecasts: { fr: '/previsions', en: '/en/forecasts', zh: '/zh/forecasts' },
  polls: { fr: '/sondages', en: '/en/polls', zh: '/zh/polls' },
  markets: { fr: '/marches', en: '/en/markets', zh: '/zh/markets' },
  candidates: { fr: '/candidats', en: '/en/candidates', zh: '/zh/candidates' },
  feed: { fr: '/fil', en: '/en/feed', zh: '/zh/feed' },
  methodology: { fr: '/methodologie', en: '/en/methodology', zh: '/zh/methodology' },
  about: { fr: '/a-propos', en: '/en/about', zh: '/zh/about' },
};

export function route(name: RouteName, lang: Lang): string {
  return paths[name][lang];
}

export function candidateRoute(slug: string, lang: Lang): string {
  if (lang === 'fr') return `/candidats/${slug}`;
  if (lang === 'en') return `/en/candidates/${slug}`;
  return `/zh/candidates/${slug}`;
}

export function routeFromPath(pathname: string): { name: RouteName; slug?: string } | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'en' || parts[0] === 'zh') parts.shift();
  const [first, second] = parts;
  if (!first) return { name: 'home' };
  if (first === 'carte' || first === 'map') return { name: 'map' };
  if (first === 'legislatives' || first === 'legislative') return { name: 'legislative' };
  if (first === 'previsions' || first === 'forecasts') return { name: 'forecasts' };
  if (first === 'sondages' || first === 'polls') return { name: 'polls' };
  if (first === 'marches' || first === 'markets') return { name: 'markets' };
  if (first === 'fil' || first === 'feed') return { name: 'feed' };
  if (first === 'methodologie' || first === 'methodology') return { name: 'methodology' };
  if (first === 'a-propos' || first === 'about') return { name: 'about' };
  if (first === 'candidats' || first === 'candidates') {
    return { name: 'candidates', slug: second };
  }
  return null;
}

export function switchLangUrl(url: URL, lang: Lang): string {
  const match = routeFromPath(url.pathname);
  if (!match) return route('home', lang);
  if (match.name === 'candidates' && match.slug) return candidateRoute(match.slug, lang) + url.search;
  return route(match.name, lang) + url.search;
}
