import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { waitLocale } from 'svelte-i18n';
import { getMe } from '$lib/api';
import { setupI18n } from '$lib/i18n';

export const ssr = false;

export const load: LayoutLoad = async () => {
  let me;
  try {
    me = await getMe();
  } catch {
    redirect(302, '/oauth2/sign_in?rd=' + encodeURIComponent(window.location.href));
  }

  setupI18n(me.locale);
  await waitLocale();

  return { me };
};
