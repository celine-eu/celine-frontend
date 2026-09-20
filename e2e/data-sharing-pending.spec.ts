import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * An offer whose connectors disagree is shown as **pending** — never as on, never as off.
 *
 * Since onboarding's ADR-0007 one offer can be recorded at several connectors (the grid
 * operator's readings *and* the community's own meter datasets). While they disagree — a
 * grant one of them refused, or a withdrawal that reached only one — onboarding's merged
 * answer carries `state: "pending"` for that offer, and `granted` stays `true` because a
 * grant stands somewhere. Rendering that flag as "Sharing is on" hides a withdrawal that has
 * not taken effect; rendering it as off hides data still being served. The maintainer decided
 * (2026-09-19) the page shows the disagreement itself.
 *
 * The control stays enabled while pending, and pressing it withdraws — everywhere, because
 * onboarding sends the decision to every connector. Withdrawal is the direction GDPR Art. 7(3)
 * says must always be available, and one decision sent to all connectors converges them
 * rather than adding a divergence.
 *
 * **Against the UI dev server, with the BFF answer stubbed** (`page.route`), so this runs
 * without the platform and asserts the rendering, not the backend. The page fetches its
 * status in the browser, after mount, which is what makes the stub reach it; the layout's
 * server-side `/api/me` gets the dev server's own 404 and renders signed-out, which this
 * page does not depend on.
 *
 *   E2E_WEBAPP_UI_URL   http://127.0.0.1:3005   (`task dev:webapp`)
 */
const UI_URL = process.env.E2E_WEBAPP_UI_URL ?? 'http://127.0.0.1:3005';

const offer = (id: string, title: string, state: string, granted: boolean) => ({
  id,
  purpose: id,
  requires_consent: true,
  can_decide: true,
  consent_text_version: '1.0',
  text: { version: '1.0', en: { title, body: `${title}.` } },
  granted,
  state,
  evidence: granted ? { consent_text_version: '1.0' } : null,
  decided_at: granted ? '2026-09-19T10:00:00Z' : null,
});

const GRANTED = offer('example-granted', 'Granted offer', 'granted', true);
const WITHDRAWN = offer('example-withdrawn', 'Withdrawn offer', 'withdrawn', false);
// `granted: true` on purpose: that is what onboarding sends for a pending offer.
const PENDING = offer('example-pending', 'Pending offer', 'pending', true);

const status = (offers: unknown[]) => ({
  has_identity: true,
  state: 'ok',
  offers,
  identity: null,
  asked: true,
  review_due: false,
});

type Decision = { offerId: string; enabled: boolean };

/** Stub the BFF: the three offers, and a decision that converges the pending one. */
async function stubSharing(page: Page, decisions: Decision[]) {
  await page.route(
    (url) => url.pathname.startsWith('/api/data-sharing'),
    async (route: Route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/data-sharing/history') {
        return route.fulfill({ json: { has_identity: true, state: 'ok', events: [] } });
      }
      if (request.method() === 'POST' && path !== '/api/data-sharing/seen') {
        const offerId = decodeURIComponent(path.split('/').pop() ?? '');
        const { enabled } = request.postDataJSON() as { enabled: boolean };
        decisions.push({ offerId, enabled });
        const converged = enabled
          ? offer(PENDING.id, 'Pending offer', 'granted', true)
          : offer(PENDING.id, 'Pending offer', 'withdrawn', false);
        return route.fulfill({ json: status([GRANTED, WITHDRAWN, converged]) });
      }
      return route.fulfill({ json: status([GRANTED, WITHDRAWN, PENDING]) });
    }
  );
}

async function open(page: Page, locale: string, decisions: Decision[] = []) {
  await page.addInitScript((l) => localStorage.setItem('locale', l), locale);
  await stubSharing(page, decisions);
  await page.goto(`${UI_URL}/data-sharing`);
  await expect(page.locator('.loading-card')).toHaveCount(0, { timeout: 30_000 });
}

const card = (page: Page, title: string) => page.locator('.settings-card', { hasText: title });

test.use({ locale: 'en-GB' });

test('a pending offer is shown as neither on nor off, with an enabled control', async ({ page }) => {
  await open(page, 'en');

  const pending = card(page, 'Pending offer');
  await expect(pending).toContainText('Sharing is pending');
  await expect(pending).not.toContainText('Sharing is on');
  await expect(pending).not.toContainText('Sharing is off');
  await expect(pending).toContainText('not all of them yet');

  const control = pending.locator('input[type="checkbox"]');
  await expect(control).toHaveCount(1);
  await expect(control).toBeEnabled();
  // Mixed: the switch itself says neither.
  await expect(control).toBeChecked({ indeterminate: true });
  // The record of a granted decision does not describe a pending one.
  await expect(pending.locator('details.evidence')).toHaveCount(0);

  // The two settled states are unchanged.
  await expect(card(page, 'Granted offer')).toContainText('Sharing is on');
  await expect(card(page, 'Granted offer').locator('input[type="checkbox"]')).toBeChecked();
  await expect(card(page, 'Withdrawn offer')).toContainText('Sharing is off');
  await expect(card(page, 'Withdrawn offer').locator('input[type="checkbox"]')).not.toBeChecked();
});

test('pressing a pending control withdraws, and the page shows what came back', async ({ page }) => {
  const decisions: Decision[] = [];
  await open(page, 'en', decisions);

  await card(page, 'Pending offer').locator('input[type="checkbox"]').click();

  await expect.poll(() => decisions).toEqual([{ offerId: PENDING.id, enabled: false }]);
  const settled = card(page, 'Pending offer');
  await expect(settled).toContainText('Sharing is off');
  await expect(settled.locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(settled.locator('input[type="checkbox"]')).toHaveJSProperty('indeterminate', false);
});

for (const [locale, label] of [
  ['en', 'Sharing is pending'],
  ['it', 'Condivisione in sospeso'],
  ['es', 'Compartir pendiente'],
] as const) {
  test(`the pending state is written in ${locale}`, async ({ page }) => {
    await open(page, locale);
    const pending = card(page, 'Pending offer');
    await expect(pending).toContainText(label);
    // A missing key renders as the key itself, and does not fail the build.
    await expect(pending).not.toContainText('data_sharing.');
  });
}
