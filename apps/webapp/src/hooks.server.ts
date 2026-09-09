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
 * The access token the proxy already resolved for this page (`X-Auth-Request-Access-Token`)
 * is the credential the API layer expects, so it is what the server render forwards.
 */
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  const sameOrigin = new URL(request.url).origin === event.url.origin;
  if (sameOrigin && !request.headers.has('authorization')) {
    const accessToken = event.request.headers.get('x-auth-request-access-token');
    if (accessToken) {
      request.headers.set('authorization', `Bearer ${accessToken}`);
    }
  }
  return fetch(request);
};
