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
