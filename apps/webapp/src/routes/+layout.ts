import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url, fetch }) => {
  let me = null;
  
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.ok) {
      me = await res.json();
    }
  } catch {
    me = null;
  }

  // If backend is unavailable, still render a basic shell with an error message.
  if (!me) {
    return { me: null, needs_terms: false };
  }

  const path = url.pathname;

  const publicRoutes = new Set(['/privacy', '/terms', '/accept-terms']);
  const needs_terms = me.terms_required;

  if (needs_terms && !publicRoutes.has(path)) {
    throw redirect(303, '/accept-terms');
  }

  return { me, needs_terms };
};