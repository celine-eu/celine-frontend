import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import type { CommunityMeta, NotificationItem } from '$lib/api';
import { setupI18n } from '$lib/i18n';
import { waitLocale } from 'svelte-i18n';

export const load: LayoutLoad = async ({ url, fetch }) => {
  let me = null;
  let status = 0;

  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    // oauth2-proxy redirects unauthenticated requests to SSO (302 → HTML page).
    // Fetch follows the redirect, so res.status may be 200 but body is HTML.
    // Detect this by checking res.redirected — a true API response is never
    // redirected. Also handle an explicit 401 for belt-and-suspenders.
    if (res.redirected) {
      return { me: null, needs_terms: false, community: null, auth_error: true, unread_count: 0 };
    }
    status = res.status;
    if (res.ok) {
      me = await res.json();
    }
  } catch {
    // Network error — backend unreachable
  }

  setupI18n(me?.locale);
  await waitLocale();

  // 401 means the JWT is expired or invalid. Return auth_error so the UI can
  // show a "session expired" banner with a login link.
  if (status === 401) {
    return { me: null, needs_terms: false, community: null, auth_error: true, unread_count: 0 };
  }

  if (!me) {
    return { me: null, needs_terms: false, community: null, auth_error: false, unread_count: 0 };
  }

  const path = url.pathname;
  const publicRoutes = new Set(['/privacy', '/terms', '/accept-terms']);
  const needs_terms = me.terms_required;

  if (needs_terms && !publicRoutes.has(path)) {
    throw redirect(303, '/accept-terms');
  }

  // Fetch community and notifications in parallel (non-blocking on error)
  let community: CommunityMeta | null = null;
  let unread_count = 0;

  const [communityRes, notificationsRes] = await Promise.allSettled([
    fetch('/api/community', { credentials: 'include' }),
    fetch('/api/notifications', { credentials: 'include' }),
  ]);

  if (communityRes.status === 'fulfilled' && communityRes.value.ok) {
    try { community = await communityRes.value.json(); } catch { /* non-fatal */ }
  }

  if (notificationsRes.status === 'fulfilled' && notificationsRes.value.ok) {
    try {
      const notifications: NotificationItem[] = await notificationsRes.value.json();
      unread_count = notifications.filter(n => !n.read_at).length;
    } catch { /* non-fatal */ }
  }

  return { me, needs_terms, community, auth_error: false, unread_count };
};
