/**
 * Which deployment a UI is running in, from runtime public env.
 *
 * `PUBLIC_CELINE_ENV` names the environment; only `prod` is production, and unset is not.
 * `PUBLIC_CELINE_PROD_URL` is where the same UI runs in production.
 */

/** True only when `env` is `prod` (trimmed, case-insensitive). */
export function isProduction(env: string | null | undefined): boolean {
  return (env ?? '').trim().toLowerCase() === 'prod';
}

/**
 * The same page in production: `prodUrl` with `path`'s pathname appended.
 * The query and fragment are dropped. Null when `prodUrl` is not an absolute http(s) URL.
 */
export function productionHref(
  prodUrl: string | null | undefined,
  path: string
): string | null {
  let base: URL;
  try {
    base = new URL((prodUrl ?? '').trim());
  } catch {
    return null;
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return null;
  const pathname = new URL(path, 'http://x').pathname;
  return `${base.origin}${base.pathname.replace(/\/+$/, '')}${pathname}`;
}
