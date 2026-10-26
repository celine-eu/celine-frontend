import { describe, expect, test } from 'vitest';

import { citedUrlsOf, renderAnswer, type LinkAllowList } from './answerLinks';

const ORIGIN = 'https://webapp.example.test';
const LEGAL = 'https://legal.example.test';
const EVIL = 'https://evil.test/collect?d=member-secret';

const base: LinkAllowList = { origin: ORIGIN, platformOrigins: [LEGAL], citedUrls: [] };

function dom(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

function anchors(html: string): HTMLAnchorElement[] {
  return Array.from(dom(html).querySelectorAll('a'));
}

describe('links that stay links', () => {
  test('a relative link', () => {
    const [a] = anchors(renderAnswer('[settings](/settings)', base));
    expect(a?.getAttribute('href')).toBe('/settings');
    expect(a?.hasAttribute('target')).toBe(false);
  });

  test('an in-page fragment', () => {
    expect(anchors(renderAnswer('[up](#top)', base))).toHaveLength(1);
  });

  test('an absolute link to the page origin, same tab', () => {
    const [a] = anchors(renderAnswer(`[home](${ORIGIN}/suggestions)`, base));
    expect(a?.getAttribute('href')).toBe(`${ORIGIN}/suggestions`);
    expect(a?.hasAttribute('target')).toBe(false);
  });

  test('a configured platform host, in a new tab without opener or referrer', () => {
    const [a] = anchors(renderAnswer(`[notice](${LEGAL}/privacy/)`, base));
    expect(a?.getAttribute('href')).toBe(`${LEGAL}/privacy/`);
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  test('a platform host given as a full URL counts by its origin', () => {
    const allow = { ...base, platformOrigins: [`${LEGAL}/privacy/`] };
    expect(anchors(renderAnswer(`[terms](${LEGAL}/terms/)`, allow))).toHaveLength(1);
  });

  test('a source the same answer cites, exactly', () => {
    const cited = 'https://docs.example.org/guide.pdf';
    const allow = { ...base, citedUrls: [cited] };
    const [a] = anchors(renderAnswer(`see [the guide](${cited})`, allow));
    expect(a?.getAttribute('href')).toBe(cited);
    expect(a?.getAttribute('target')).toBe('_blank');
  });

  test('a cited source still matches with a fragment added', () => {
    const cited = 'https://docs.example.org/guide.pdf';
    const allow = { ...base, citedUrls: [cited] };
    expect(anchors(renderAnswer(`[p. 3](${cited}#page=3)`, allow))).toHaveLength(1);
  });
});

describe('links rendered as plain text', () => {
  test('a foreign host: no anchor, the text and the URL both visible', () => {
    const html = renderAnswer(`[verify your account](${EVIL})`, base);
    expect(anchors(html)).toHaveLength(0);
    const text = dom(html).textContent ?? '';
    expect(text).toContain('verify your account');
    expect(text).toContain(EVIL);
  });

  test('a bare URL autolinked by markdown shows once', () => {
    const html = renderAnswer(`go to ${EVIL} now`, base);
    expect(anchors(html)).toHaveLength(0);
    expect((dom(html).textContent ?? '').split(EVIL)).toHaveLength(2);
  });

  test('markup inside the link text is kept', () => {
    const html = renderAnswer(`[**click**](${EVIL})`, base);
    expect(anchors(html)).toHaveLength(0);
    expect(dom(html).querySelector('strong')?.textContent).toBe('click');
  });

  test('a raw HTML anchor to a foreign host', () => {
    const html = renderAnswer(`<a href="${EVIL}" target="_blank">open</a>`, base);
    expect(anchors(html)).toHaveLength(0);
    expect(dom(html).textContent).toContain(EVIL);
  });

  test('a protocol-relative URL', () => {
    expect(anchors(renderAnswer('<a href="//evil.test/x">x</a>', base))).toHaveLength(0);
  });

  test('a backslash URL the browser reads as protocol-relative', () => {
    expect(anchors(renderAnswer('<a href="/\\evil.test/x">x</a>', base))).toHaveLength(0);
  });

  test('a platform host behind userinfo', () => {
    const html = renderAnswer(`[x](https://webapp.example.test@evil.test/)`, base);
    expect(anchors(html)).toHaveLength(0);
  });

  test('a platform host on another scheme', () => {
    expect(anchors(renderAnswer('[x](http://legal.example.test/)', base))).toHaveLength(0);
  });

  test('a platform host on another port', () => {
    expect(anchors(renderAnswer('[x](https://legal.example.test:8443/)', base))).toHaveLength(0);
  });

  test('another page of a cited host', () => {
    const allow = { ...base, citedUrls: ['https://docs.example.org/guide.pdf'] };
    const html = renderAnswer('[x](https://docs.example.org/guide.pdf?d=secret)', allow);
    expect(anchors(html)).toHaveLength(0);
  });

  test('mailto and tel', () => {
    expect(anchors(renderAnswer('[mail](mailto:a@evil.test?body=secret)', base))).toHaveLength(0);
    expect(anchors(renderAnswer('[call](tel:+390000000)', base))).toHaveLength(0);
  });

  test('an image map area to a foreign host', () => {
    const html = renderAnswer(
      `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" usemap="#m"><map name="m"><area shape="default" href="${EVIL}"></map>`,
      base,
    );
    expect(dom(html).querySelector('area[href]')).toBeNull();
  });

  test('a form is removed', () => {
    const html = renderAnswer(
      `<form action="${EVIL}"><input name="d" value="x"><button>Verify</button></form>`,
      base,
    );
    expect(dom(html).querySelector('form')).toBeNull();
  });

  test('with no known origin only relative links stay', () => {
    const allow = { platformOrigins: [], citedUrls: [] };
    expect(anchors(renderAnswer('[a](/settings)', allow))).toHaveLength(1);
    expect(anchors(renderAnswer(`[b](${ORIGIN}/settings)`, allow))).toHaveLength(0);
  });

  test('javascript: is still stripped', () => {
    const html = renderAnswer('<a href="javascript:alert(1)">x</a>', base);
    expect(html).not.toContain('javascript:');
  });
});

describe('citedUrlsOf', () => {
  test('keeps http(s) sources only', () => {
    expect(
      citedUrlsOf([
        { source: 'https://docs.example.org/a.pdf' },
        { source: 'kb-source://handbook/a.md' },
        { source: 'attached_files' },
        { source: 'javascript:alert(1)' },
      ]),
    ).toEqual(['https://docs.example.org/a.pdf']);
  });

  test('no sources, no URLs', () => {
    expect(citedUrlsOf(undefined)).toEqual([]);
  });
});
