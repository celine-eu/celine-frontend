import { getLocaleFromNavigator, init, register, locale } from 'svelte-i18n';

register('en', () => import('./en.json'));
register('it', () => import('./it.json'));
register('es', () => import('./es.json'));

export const SUPPORTED = ['en', 'it', 'es'] as const;
export const LOCALE_LABELS: Record<string, string> = { en: 'EN', it: 'IT', es: 'ES' };

export function setupI18n() {
  const saved =
    typeof localStorage !== 'undefined' && localStorage?.getItem ? localStorage?.getItem('locale') : null;
  const detected = saved ?? getLocaleFromNavigator()?.slice(0, 2) ?? 'en';
  const initial = SUPPORTED.includes(detected as typeof SUPPORTED[number]) ? detected : 'en';
  init({ fallbackLocale: 'en', initialLocale: initial });
}

export function setLocale(lang: string) {
  locale.set(lang);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('locale', lang);
  }
}
