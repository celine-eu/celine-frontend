import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The ROI calculator is public and **never prompts for sign-in**. Feedback is offered only to a
 * visitor who already has an SSO session from another app of the same domain.
 *
 * The deployment's contract (infra, the roi chart's feedback Ingress): `/api/v1/feedback*` goes
 * through the SSO proxy's auth check without a sign-in redirect, so an anonymous request gets a
 * plain `401` and a request with a session gets `200`. The ROI host has no `/oauth2` route, so a
 * client that answers that `401` by navigating to a sign-in URL sends every anonymous visitor to
 * a 404 — which is what roi-v0.29.0 did.
 *
 * The level is the stubbed one, like `data-sharing-disclosure.spec.ts`: the feedback API's
 * answer is the whole input of the rule, so it is written here with `page.route`. Every request
 * that would leave the machine (map tiles, geocoding) is refused; the calculator must render
 * without them. Nothing here shows that a deployment answers this way — that is the Ingress's
 * job, and it is checked against the cluster, not here.
 *
 *   E2E_ROI_UI_URL   http://127.0.0.1:3004   (`pnpm dev:roi`) — nothing else is needed
 */
const UI_URL = process.env.E2E_ROI_UI_URL ?? 'http://127.0.0.1:3004';
const UI_ORIGIN = new URL(UI_URL).origin;

const COMMUNITIES = '**/api/v1/feedback/communities';
const SUBMIT = '**/api/v1/feedback';

test.use({ locale: 'en-US' });

type Watch = { navigations: string[]; pageErrors: string[]; warnings: string[]; errors: string[] };

/** Refuse everything off the dev server, and record what the page does after it loads. */
async function open(page: Page): Promise<Watch> {
  const watch: Watch = { navigations: [], pageErrors: [], warnings: [], errors: [] };
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === UI_ORIGIN ? route.fallback() : route.abort(),
  );
  page.on('pageerror', (error) => watch.pageErrors.push(error.message));
  page.on('console', (message) => {
    // The browser itself reports a 4xx/5xx resource; that line is not the page's code.
    if (message.text().startsWith('Failed to load resource')) return;
    if (message.type() === 'warning') watch.warnings.push(message.text());
    if (message.type() === 'error') watch.errors.push(message.text());
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) watch.navigations.push(frame.url());
  });
  return watch;
}

async function load(page: Page): Promise<void> {
  await page.goto(`${UI_URL}/`);
  await expect(page.getByText('Select location')).toBeVisible();
}

/** Over at least 2 s, the page never left `/` of the ROI host. */
async function staysOnTheCalculator(page: Page, watch: Watch): Promise<void> {
  await page.waitForTimeout(2_000);
  for (const url of [...watch.navigations, page.url()]) {
    const { origin, pathname } = new URL(url);
    expect(`${origin}${pathname}`, `navigated to ${url}`).toBe(`${UI_ORIGIN}/`);
  }
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const feedbackButton = (page: Page) => page.getByRole('button', { name: 'Feedback', exact: true });

async function sendFeedback(page: Page): Promise<void> {
  await feedbackButton(page).click();
  await page.getByRole('button', { name: '4 stelle' }).click();
  await page.getByLabel('Comment').fill('The payback chart is clear.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
}

test('anonymous: the feedback 401 hides the widget, and the page stays put', async ({ page }) => {
  const watch = await open(page);
  let probed = false;
  await page.route(COMMUNITIES, (route) => {
    probed = true;
    return route.fulfill({ status: 401, body: '' });
  });

  await load(page);
  await staysOnTheCalculator(page, watch);

  expect(probed, 'the page asked for the communities').toBe(true);
  await expect(feedbackButton(page)).toHaveCount(0);
  expect(watch.pageErrors).toEqual([]);
  expect(watch.errors).toEqual([]);
  expect(watch.warnings, 'anonymous is not a failure').toEqual([]);
});

test('session: the widget is offered and a submission succeeds', async ({ page }) => {
  const watch = await open(page);
  let submitted: Record<string, unknown> | null = null;
  await page.route(COMMUNITIES, (route) => json(route, 200, { communities: ['example-rec'] }));
  await page.route(SUBMIT, (route) => {
    submitted = route.request().postDataJSON();
    return json(route, 200, { id: 'fb-1' });
  });

  await load(page);
  await sendFeedback(page);

  await expect(page.getByText('Feedback sent successfully.')).toBeVisible({ timeout: 20_000 });
  expect(submitted).toMatchObject({ community_key: 'example-rec', rating: 4 });
  await staysOnTheCalculator(page, watch);
  expect(watch.pageErrors).toEqual([]);
});

test('expired session: a 401 on submit says so, and the page stays put', async ({ page }) => {
  const watch = await open(page);
  await page.route(COMMUNITIES, (route) => json(route, 200, { communities: ['example-rec'] }));
  await page.route(SUBMIT, (route) => route.fulfill({ status: 401, body: '' }));

  await load(page);
  await sendFeedback(page);

  await expect(
    page.getByText('Your session has expired. Sign in again on the platform to send feedback.'),
  ).toBeVisible({ timeout: 20_000 });
  await staysOnTheCalculator(page, watch);
  expect(watch.pageErrors).toEqual([]);
});

test('probe failure: a 500 hides the widget and the calculator still works', async ({ page }) => {
  const watch = await open(page);
  await page.route(COMMUNITIES, (route) => json(route, 500, { detail: 'boom' }));

  await load(page);
  await staysOnTheCalculator(page, watch);

  await expect(feedbackButton(page)).toHaveCount(0);
  expect(watch.warnings.filter((text) => text.includes('feedback'))).toHaveLength(1);
  expect(watch.pageErrors).toEqual([]);
});

test('slow probe: the calculator does not wait for feedback', async ({ page }) => {
  const watch = await open(page);
  // Never answered: the calculator must render regardless.
  await page.route(COMMUNITIES, () => new Promise<void>(() => {}));

  await load(page);
  await staysOnTheCalculator(page, watch);

  await expect(feedbackButton(page)).toHaveCount(0);
  expect(watch.pageErrors).toEqual([]);
});
