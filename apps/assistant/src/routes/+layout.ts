import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url, fetch }) => {
  let status = 0;

  try {
    const res = await fetch('/api/user', { credentials: 'include' });
    status = res.status;
  } catch {
    // Network error — backend unreachable, let the app render
  }

  if (status === 401) {
    const returnTo = `${url.origin}${url.pathname}${url.search}`;
    throw redirect(303, `/oauth2/sign_in?rd=${encodeURIComponent(returnTo)}`);
  }
};
