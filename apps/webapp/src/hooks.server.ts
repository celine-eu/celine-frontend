import type { HandleFetch } from '@sveltejs/kit';

/**
 * Server-side `fetch` in a `load` function forwards the incoming request's `cookie`
 * and — when the outgoing request has none — its `authorization` header to same-origin
 * URLs. Behind the ingress that `Authorization` header is the *ID token* (oauth2-proxy
 * `set_authorization_header`), and oauth2-proxy prefers a bearer token over the session
 * cookie (`skip_jwt_bearer_tokens`): on every server render right after login the API
 * request therefore carried the ID token as its access token, and a backend that checks
 * its own audience (nudging: `svc-celine-nudging`) answered 401 — the
 * `/api/notifications` 500 in staging, 2026-09.
 *
 * Forwarding the access token as the bearer instead is not the answer either: for a
 * bearer-created session oauth2-proxy echoes that token in two response headers, and the
 * ingress's auth subrequest then fails with "upstream sent too big header" (502 → the
 * render's `/api/me` 500, staging 2026-09-09 13:12).
 *
 * So for same-origin API calls the render bypasses SvelteKit's header forwarding and
 * sends exactly what the browser sends: the session cookie and no `Authorization`
 * header at all. The proxy resolves the session from the cookie and injects the real
 * access token, the path every client-side request already takes.
 */
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  const url = new URL(request.url);
  if (url.origin !== event.url.origin || !url.pathname.startsWith('/api/')) {
    return fetch(request);
  }

  const headers = new Headers(request.headers);
  headers.delete('authorization');
  const cookie = event.request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  return globalThis.fetch(new Request(request, { headers }));
};
