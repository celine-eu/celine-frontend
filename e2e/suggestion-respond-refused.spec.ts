import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * An accept that flexibility-api refuses tells the member why, in their language.
 *
 * Members with no meter could accept a flexibility window, and flexibility-api then stored
 * a commitment that could never be settled. It now refuses the accept, and celine-webapp
 * passes the refusal through unchanged:
 *
 *   409 {"detail": {"code": "no_meter", ...}}       — no meter linked to the member
 *   409 {"detail": {"code": "not_a_member", ...}}   — no community membership
 *   503 {"detail": {"code": "dt_unavailable", ...}} — twin/registry down, retry later
 *
 * The window strip words its message on `detail.code`, never on the raw error text. The two
 * 409s are about the member rather than the window, so after one of them the commit button
 * stays disabled: retrying cannot succeed.
 *
 * **Against the UI dev server, with the BFF stubbed** (`page.route`), like
 * `data-sharing-pending.spec.ts`. It settles the rendering of these bodies; it settles
 * nothing about whether flexibility-api or the BFF produce them — celine-webapp's
 * `tests/test_suggestion_respond.py` covers the BFF half against the real SDK client.
 *
 *   E2E_WEBAPP_UI_URL   http://127.0.0.1:3005   (`pnpm dev:webapp`)
 */
const UI_URL = process.env.E2E_WEBAPP_UI_URL ?? 'http://127.0.0.1:3005';

function windowAt(hoursFromNow: number, id: string) {
  const start = new Date(Date.now() + hoursFromNow * 3_600_000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3_600_000);
  return {
    id,
    suggestion_type: 'shift-consumption',
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    from_period: 'morning',
    clock_range: '',
    to_is_tomorrow: false,
    to_period: 'midday',
    to_time: '',
    community_kwh: 12,
    impact_kwh_estimated: 1.5,
    confidence: 0.8,
    reward_points: 10,
  };
}

const SUGGESTIONS = [windowAt(4, 'window-a'), windowAt(8, 'window-b')];

type Refusal = { status: number; body: unknown };

/** Stub every BFF call the suggestions page makes; `respond` answers with `refusal`. */
async function stubBff(page: Page, refusal: Refusal, responds: string[]) {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/suggestions') return route.fulfill({ json: SUGGESTIONS });
      if (path === '/api/gamification/history') {
        return route.fulfill({ json: { items: [], total: 0, total_points_earned: 0 } });
      }
      if (path.endsWith('/respond')) {
        responds.push(path);
        return route.fulfill({ status: refusal.status, json: refusal.body });
      }
      return route.fulfill({ status: 404, json: { detail: 'not stubbed' } });
    }
  );
}

async function openAndCommit(page: Page, locale: string, refusal: Refusal, responds: string[] = []) {
  await page.addInitScript((l) => localStorage.setItem('locale', l), locale);
  await stubBff(page, refusal, responds);
  await page.goto(`${UI_URL}/suggestions`);
  await page.locator('button.segment').first().click();
  await page.locator('.popover .btn-primary').click();
  return page.locator('.popover .error-msg');
}

test.use({ locale: 'en-GB' });

const NO_METER = { status: 409, body: { detail: { code: 'no_meter', message: 'upstream text' } } };

for (const [locale, text] of [
  ['en', "You don't have a meter linked to your account yet"],
  ['it', 'Non hai ancora un contatore associato: non puoi aderire a questa finestra.'],
  ['es', 'Todavía no tienes un contador asociado'],
] as const) {
  test(`a refusal for a missing meter is explained in ${locale}`, async ({ page }) => {
    const error = await openAndCommit(page, locale, NO_METER);
    await expect(error).toContainText(text);
    await expect(error).not.toContainText('409');
    await expect(error).not.toContainText('upstream text');
  });
}

test('a refusal for a missing membership is explained', async ({ page }) => {
  const error = await openAndCommit(page, 'en', {
    status: 409,
    body: { detail: { code: 'not_a_member', message: 'm' } },
  });
  await expect(error).toContainText("isn't registered as a community member");
});

test('an unavailable twin asks to retry, and leaves the button usable', async ({ page }) => {
  const error = await openAndCommit(page, 'en', {
    status: 503,
    body: { detail: { code: 'dt_unavailable', message: 'm' } },
  });
  await expect(error).toContainText('try again in a few minutes');
  await expect(page.locator('.popover .btn-primary')).toBeEnabled();
});

test('an unknown failure gets the generic message, not the raw error', async ({ page }) => {
  const error = await openAndCommit(page, 'en', { status: 500, body: { detail: 'boom' } });
  await expect(error).toContainText("your commitment wasn't saved");
  await expect(error).not.toContainText('boom');
});

test('after a missing-meter refusal no other window can be committed', async ({ page }) => {
  const responds: string[] = [];
  await openAndCommit(page, 'en', NO_METER, responds);
  await expect(page.locator('.popover .btn-primary')).toBeDisabled();

  await page.locator('.popover .btn-secondary').click();
  await page.locator('button.segment').nth(1).click();

  await expect(page.locator('.popover .error-msg')).toContainText("You don't have a meter");
  await expect(page.locator('.popover .btn-primary')).toBeDisabled();
  expect(responds).toHaveLength(1);
});
