import type { RequestHandler } from './$types';
import type { CommunityMeta } from '$lib/api';

/**
 * Web app manifest: what makes the webapp installable.
 *
 * Served from a route rather than `static/` because the installed app is named after the
 * member's community, which only the BFF knows. The request carries the session cookie
 * because `app.html` links it with `crossorigin="use-credentials"` — without that the
 * browser fetches the manifest anonymously, and behind the ingress oauth2-proxy answers
 * with the login redirect instead. No session, or no community: the name falls back to
 * `REC`, as in the header.
 */
export const GET: RequestHandler = async ({ fetch }) => {
  let name = 'REC';
  try {
    const res = await fetch('/api/community');
    if (res.ok && !res.redirected) {
      const community: CommunityMeta = await res.json();
      if (community.name) name = community.name;
    }
  } catch {
    // Backend unreachable — keep the fallback name.
  }

  const manifest = {
    id: '/',
    name,
    short_name: name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#0d9488',
    background_color: '#fafbfc',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'content-type': 'application/manifest+json',
      // Per member: never shared by a cache.
      'cache-control': 'private, no-cache',
    },
  });
};
