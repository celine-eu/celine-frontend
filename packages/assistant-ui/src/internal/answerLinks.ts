import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Where a link in an assistant answer may point.
 *
 * An injected instruction can make the model write a link whose URL carries the
 * member's data; one click sends it away. The CSP stops images to other hosts but not
 * navigation, so links are allowed only to:
 * - the page's own origin (relative links included);
 * - the platform's other hosts the app configures (`platformOrigins`, compared by origin);
 * - the sources the same answer cites (`citedUrls`, compared by the exact URL, fragment
 *   ignored), so a cited host cannot take an arbitrary query string.
 *
 * Every other URL — any other host, `mailto:`, `tel:` — is rendered as text, visible but
 * not clickable.
 */
export interface LinkAllowList {
  /** Origin of the page showing the answer. Without it only relative links stay links. */
  origin?: string;
  /** Platform hosts, as origins or as any absolute URL on them (only the origin counts). */
  platformOrigins?: string[];
  /** URLs of the sources cited by this answer. */
  citedUrls?: string[];
}

type Verdict = 'same-origin' | 'external' | 'blocked';

// Base for resolving relative links when the page origin is unknown. `.invalid` never
// resolves (RFC 2606).
const UNKNOWN_ORIGIN = 'https://same-origin.invalid';

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ADD_ATTR: ['target', 'rel'],
  // A form posts its fields on a click, like a link carries its query string.
  FORBID_TAGS: ['form'],
  RETURN_DOM_FRAGMENT: true as const,
};

function httpUrl(value: string, base?: string): URL | null {
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function withoutFragment(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = '';
  return copy.href;
}

function classify(href: string, allow: LinkAllowList): Verdict {
  const pageOrigin = (allow.origin && httpUrl(allow.origin)?.origin) || null;
  const url = httpUrl(href.trim(), `${pageOrigin ?? UNKNOWN_ORIGIN}/`);
  if (!url) return 'blocked';

  if (pageOrigin ? url.origin === pageOrigin : url.origin === UNKNOWN_ORIGIN && !httpUrl(href.trim())) {
    return 'same-origin';
  }

  const platform = new Set(
    (allow.platformOrigins ?? []).map((u) => httpUrl(u)?.origin).filter((o): o is string => !!o),
  );
  if (platform.has(url.origin)) return 'external';

  const cited = new Set(
    (allow.citedUrls ?? []).map((u) => httpUrl(u)).filter((u): u is URL => !!u).map(withoutFragment),
  );
  if (cited.has(withoutFragment(url))) return 'external';

  return 'blocked';
}

/** Replaces each link that is not allowed with its content and, if different, its URL. */
function restrictLinks(root: DocumentFragment, allow: LinkAllowList): void {
  for (const link of Array.from(root.querySelectorAll<HTMLElement>('a[href], area[href]'))) {
    const href = link.getAttribute('href') ?? '';
    const verdict = classify(href, allow);

    if (verdict === 'external') {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      continue;
    }
    if (verdict === 'same-origin') continue;

    const doc = link.ownerDocument;
    const shown = (link.textContent ?? '').trim();
    const replacement = doc.createDocumentFragment();
    replacement.append(...Array.from(link.childNodes));
    if (shown !== href.trim()) {
      replacement.append(doc.createTextNode(replacement.childNodes.length ? ` (${href})` : href));
    }
    link.replaceWith(replacement);
  }
}

/**
 * Renders an assistant answer (markdown) to sanitized HTML whose links obey `allow`.
 *
 * Needs a DOM: where DOMPurify cannot run (server-side rendering) it returns an empty
 * string rather than unsanitized HTML.
 */
export function renderAnswer(text: string, allow: LinkAllowList): string {
  if (!DOMPurify.isSupported || typeof document === 'undefined') return '';

  const html = marked.parse(text ?? '', { gfm: true, breaks: true, async: false });
  const fragment = DOMPurify.sanitize(html, PURIFY_CONFIG);
  restrictLinks(fragment, allow);

  const holder = document.createElement('div');
  holder.append(fragment);
  return holder.innerHTML;
}

/** The http(s) URLs among an answer's cited sources; ids such as `kb-source://` are not links. */
export function citedUrlsOf(sources: { source: string }[] | undefined | null): string[] {
  return (sources ?? []).map((s) => s.source).filter((s) => typeof s === 'string' && !!httpUrl(s));
}
