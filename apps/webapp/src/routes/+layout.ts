import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import type { CommunityMeta } from '$lib/api';

export const load: LayoutLoad = async ({ url, fetch }) => {
  let me = null;
  let status = 0;

  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    status = res.status;
    if (res.ok) {
      me = await res.json();
    }
  } catch {
    // Network error — backend unreachable
  }

  // 401 here means JWT validation failed inside the app (not a missing session).
  // Caddy/oauth2-proxy redirects unauthenticated users before SvelteKit runs,
  // so redirecting to /oauth2/sign_in from here would just loop.
  // Return null user and let the UI handle it gracefully.
  if (status === 401) {
    return { me: null, needs_terms: false, community: null };
  }

  if (!me) {
    return { me: null, needs_terms: false, community: null };
  }

  const path = url.pathname;
  const publicRoutes = new Set(['/privacy', '/terms', '/accept-terms']);
  const needs_terms = me.terms_required;

  if (needs_terms && !publicRoutes.has(path)) {
    throw redirect(303, '/accept-terms');
  }

  let community: CommunityMeta | null = null;
  try {
    const res = await fetch('/api/community', { credentials: 'include' });
    if (res.ok) community = await res.json();
  } catch {
    // non-fatal
  }

  return { me, needs_terms, community };
};
