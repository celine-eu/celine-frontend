import { expect, test } from '@playwright/test';

/**
 * An `/api/*` request that reaches an app's own server — no API in front, as on a dev server
 * hit directly — must end in one answer. The apps' layouts fetch the API while rendering, and
 * their `hooks.server.ts` sends such fetches back to the same server as real requests, so a
 * 404 used to render the layout that caused the next request, without end (celine-dev,
 * 2026-09-15: thousands of sockets, the host's ephemeral ports exhausted).
 */
const APPS = [
  { name: 'webapp', url: process.env.E2E_WEBAPP_UI_URL ?? 'http://127.0.0.1:3005', probe: '/api/me' },
  { name: 'assistant', url: process.env.E2E_ASSISTANT_UI_URL ?? 'http://127.0.0.1:3003', probe: '/api/user' },
];

for (const app of APPS) {
  test(`${app.name}: an /api path on the UI server answers promptly instead of fetching itself`, async ({ request }) => {
    const started = Date.now();
    const res = await request.get(`${app.url}${app.probe}`, { timeout: 10_000 });

    expect(res.status()).toBe(404);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test(`${app.name}: the root still renders without an API in front`, async ({ request }) => {
    const res = await request.get(`${app.url}/`, { timeout: 15_000, maxRedirects: 0 });
    expect(res.status()).toBeLessThan(400);
  });
}
