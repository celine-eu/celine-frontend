/**
 * Periodic session health check.
 * Pings an authenticated backend endpoint; on 401 or oauth2-proxy redirect,
 * redirects the browser to the SSO login page.
 */

const SESSION_GUARD_KEY = '__celine_session_redirect';

export function startSessionGuard(opts: {
  pingUrl: string;
  intervalMs?: number;
  loginUrl?: string;
}): () => void {
  const intervalMs = opts.intervalMs ?? 120_000;
  const loginUrl = opts.loginUrl ?? '/oauth2/sign_in';
  let timer: ReturnType<typeof setInterval> | null = null;
  let redirecting = false;

  // After a successful ping, clear any previous redirect marker so a future
  // expiry can trigger a new redirect.
  const lastRedirect = sessionStorage.getItem(SESSION_GUARD_KEY);
  if (lastRedirect) {
    // We're back after a redirect — clear the marker but skip the first
    // interval to avoid immediately re-checking before the fresh session
    // cookie is fully propagated.
    sessionStorage.removeItem(SESSION_GUARD_KEY);
  }

  function redirectToLogin() {
    if (redirecting) return;
    redirecting = true;
    stop();

    // Stamp sessionStorage so the next page load knows we just redirected.
    // If the login page redirects back and the session is *still* invalid
    // (misconfiguration), we won't loop — the marker survives only one
    // round-trip.
    if (sessionStorage.getItem(SESSION_GUARD_KEY)) return;
    sessionStorage.setItem(SESSION_GUARD_KEY, '1');

    window.location.href = `${loginUrl}?rd=${encodeURIComponent(window.location.href)}`;
  }

  async function check() {
    if (redirecting) return;
    try {
      const res = await fetch(opts.pingUrl, {
        credentials: 'include',
        redirect: 'manual',
      });
      // redirect: 'manual' returns an opaque response (type 'opaqueredirect',
      // status 0) when the oauth2-proxy 302s to the SSO login page.
      if (res.type === 'opaqueredirect' || res.status === 0 || res.status === 401) {
        redirectToLogin();
      }
    } catch {
      // Network error — not a session issue
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') check();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    document.removeEventListener('visibilitychange', onVisibility);
  }

  timer = setInterval(check, intervalMs);
  document.addEventListener('visibilitychange', onVisibility);

  return stop;
}
