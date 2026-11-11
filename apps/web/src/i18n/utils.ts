import { ui, type Lang, type UIKey } from './ui';

export function getLangFromUrl(url: URL): Lang {
  const [, first] = url.pathname.split('/');
  if (first === 'en' || first === 'zh') return first;
  return 'fr';
}

export function useTranslations(lang: Lang) {
  return (key: UIKey): string => ui[lang][key] ?? ui.fr[key];
}

export function localizePath(path: string, lang: Lang): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === 'fr') return clean;
  return `/${lang}${clean === '/' ? '' : clean}`;
}

export function switchLangPath(url: URL, lang: Lang): string {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'en' || parts[0] === 'zh') parts.shift();
  const base = `/${parts.join('/')}`;
  return localizePath(base === '/' ? '/' : base, lang) + url.search;
}

export function localeLabel(lang: Lang): string {
  return lang === 'fr' ? 'FR' : lang === 'en' ? 'EN' : '中文';
}
