import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { waitLocale } from 'svelte-i18n';
import { getMe } from '$lib/api';
import { setupI18n } from '$lib/i18n';

export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
  // /denied is a public page — no auth check needed
  if (url.pathname === '/denied') {
    setupI18n(undefined);
    await waitLocale();
    return { me: null };
  }

  let me;
  try {
    me = await getMe();
  } catch (e) {
    if (e instanceof Error && e.message.includes('403')) {
      redirect(302, '/denied');
    }
    redirect(302, '/oauth2/sign_in?rd=' + encodeURIComponent(window.location.href));
  }

  setupI18n(me.locale);
  await waitLocale();

  return { me };
};
