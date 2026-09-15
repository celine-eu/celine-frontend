import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { setupI18n } from '$lib/i18n';
import { waitLocale } from 'svelte-i18n';

export const load: LayoutLoad = async ({ url, fetch }) => {
  let status = 0;

  // An `/api/*` path that reached this app has no API in front of it (a dev server hit
  // directly, a probe). `hooks.server.ts` sends the `/api/user` below as a real request
  // back to this same server, whose 404 renders this layout again, without end. Never
  // fetch the API while rendering one. Same guard as the webapp's layout.
  if (url.pathname.startsWith('/api/')) {
    setupI18n();
    await waitLocale();
    return;
  }

  try {
    const res = await fetch('/api/user', { credentials: 'include' });
    status = res.status;
  } catch {
    // Network error — backend unreachable, let the app render
  }

  setupI18n();
  await waitLocale();

  if (status === 401) {
    const returnTo = `${url.origin}${url.pathname}${url.search}`;
    throw redirect(303, `/oauth2/sign_in?rd=${encodeURIComponent(returnTo)}`);
  }
};
