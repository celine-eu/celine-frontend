import { getLocaleFromNavigator, init, register } from 'svelte-i18n';

register('en', () => import('./en.json'));
register('it', () => import('./it.json'));

const SUPPORTED = ['en', 'it'];

export function setupI18n(backendLocale?: string | null) {
  const saved =
    typeof localStorage !== 'undefined' && localStorage?.getItem
      ? localStorage?.getItem('locale')
      : null;
  const detected = saved ?? backendLocale ?? getLocaleFromNavigator()?.slice(0, 2) ?? 'en';
  const initial = SUPPORTED.includes(detected) ? detected : 'en';
  init({ fallbackLocale: 'en', initialLocale: initial });
}
