import { expect, test } from '@playwright/test';

/**
 * Every app sends its own Content-Security-Policy (`kit.csp` in its `svelte.config.js`): the
 * page's inline scripts — SvelteKit's bootstrap and the theme script in `app.html` — carry the
 * response's nonce, `script-src` allows no 'unsafe-inline', and the page loads without the
 * browser refusing anything. The dev servers send the same policy as a production build.
 */
const APPS = [
  { name: 'webapp', url: process.env.E2E_WEBAPP_UI_URL ?? 'http://127.0.0.1:3005' },
  { name: 'assistant', url: process.env.E2E_ASSISTANT_UI_URL ?? 'http://127.0.0.1:3003' },
  { name: 'community', url: process.env.E2E_COMMUNITY_UI_URL ?? 'http://127.0.0.1:3007' },
  { name: 'grid', url: process.env.E2E_GRID_UI_URL ?? 'http://127.0.0.1:3006' },
  { name: 'roi', url: process.env.E2E_ROI_UI_URL ?? 'http://127.0.0.1:3004' },
];

/**
 * Apps whose own header is the whole policy: a `default-src 'self'` fallback for every
 * directive they do not name, and `base-uri`/`form-action` (which do not fall back) set.
 * grid still sends only its script directives (the rest is a Report-Only trial at the ingress).
 */
const WHOLE_POLICY = new Set(['webapp', 'assistant', 'community', 'roi']);

function directive(policy: string, name: string): string | undefined {
  return policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

for (const app of APPS) {
  test(`${app.name}: inline scripts run by nonce, not by 'unsafe-inline'`, async ({ page }) => {
    const refused: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        console.error(`csp-refused ${event.effectiveDirective} ${event.blockedURI}`);
      });
    });
    page.on('console', (message) => {
      if (message.text().startsWith('csp-refused')) refused.push(message.text());
    });

    const response = await page.goto(`${app.url}/`);
    expect(response, app.url).not.toBeNull();
    const policy = (await response!.allHeaders())['content-security-policy'];
    expect(policy, 'the app sends a Content-Security-Policy').toBeTruthy();

    const scriptSrc = directive(policy, 'script-src');
    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    const nonce = /'nonce-([^']+)'/.exec(scriptSrc!)?.[1];
    expect(nonce, 'script-src carries a nonce').toBeTruthy();
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    if (WHOLE_POLICY.has(app.name)) {
      expect(directive(policy, 'default-src')).toBe("default-src 'self'");
      expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
      expect(directive(policy, 'form-action')).toBe("form-action 'self'");
    }

    const html = await response!.text();
    const inline = [...html.matchAll(/<script\b([^>]*)>/g)]
      .map((match) => match[1])
      .filter((attributes) => !/\ssrc=/.test(attributes) && !/application\/json/.test(attributes));
    expect(inline.length).toBeGreaterThan(0);
    for (const attributes of inline) {
      expect(attributes).toContain(`nonce="${nonce}"`);
    }

    await page.waitForLoadState('load');
    await page.waitForTimeout(1_000);
    expect(refused).toEqual([]);
  });
}

/**
 * roi enforces its whole policy, so everything the calculator loads from elsewhere is named
 * host by host, with no wildcard: Leaflet's OpenStreetMap tiles (`{s}` is a, b or c) as
 * images, the address search on Nominatim as a fetch. The tile server and Nominatim are
 * stubbed with `page.route`, so nothing leaves the machine; a request the policy refused never
 * reaches the route, so a stubbed request is one the browser allowed.
 * Not covered here: the results page and its PDF (static map image, html2canvas, jsPDF),
 * which need the roi API.
 */
test('roi: the map and the address search load under the enforced policy', async ({ page }) => {
  const url = APPS.find((app) => app.name === 'roi')!.url;
  const refused: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`csp-refused ${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  page.on('console', (message) => {
    if (message.text().startsWith('csp-refused')) refused.push(message.text());
  });

  const tiles: string[] = [];
  const searches: string[] = [];
  await page.route(/\.tile\.openstreetmap\.org\//, (route) => {
    tiles.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.route(/^https:\/\/nominatim\.openstreetmap\.org\//, (route) => {
    searches.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([{ lat: '45.4642', lon: '9.19', display_name: 'Example' }]),
    });
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  );

  const response = await page.goto(`${url}/`);
  const policy = (await response!.allHeaders())['content-security-policy'];
  for (const part of policy.split(';')) {
    expect(part, 'no wildcard source').not.toMatch(/(^|\s)(\S*\*\S*)/);
  }
  expect(directive(policy, 'img-src')).toContain('https://a.tile.openstreetmap.org');
  expect(directive(policy, 'connect-src')).toContain('https://nominatim.openstreetmap.org');

  await expect.poll(() => tiles.length, { message: 'the map asked for tiles' }).toBeGreaterThan(0);
  await page.locator('.address-input').fill('Piazza del Duomo, Milano');
  await page.locator('.address-input').press('Enter');
  await expect.poll(() => searches.length, { message: 'the search reached Nominatim' }).toBe(1);

  await page.waitForTimeout(1_000);
  expect(refused).toEqual([]);
});
