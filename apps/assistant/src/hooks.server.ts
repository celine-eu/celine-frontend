import type { HandleFetch } from '@sveltejs/kit';

/**
 * Server-side `fetch` in a `load` function forwards the incoming request's `authorization`
 * header to same-origin URLs. Behind the proxy that header is the *ID token* (oauth2-proxy
 * `set_authorization_header`), and oauth2-proxy prefers a bearer token over the session
 * cookie (`skip_jwt_bearer_tokens`): it then reports that ID token as the access token, in
 * `X-Auth-Request-Access-Token`. The assistant API verifies the access token it is given,
 * so every server render's `/api/user` was refused — "No access_token provided to compare
 * against at_hash claim" — and the layout sent the browser back to sign-in, in a loop
 * (celine-dev, 2026-09-15; measured against oauth2-proxy 7.11: cookie alone → a `Bearer`
 * access token, cookie plus the forwarded ID token → the ID token).
 *
 * So for same-origin API calls the render sends exactly what the browser sends: the session
 * cookie and no `Authorization` header. The proxy resolves the session from the cookie and
 * injects the real access token. Same arrangement as the webapp's `hooks.server.ts`.
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
