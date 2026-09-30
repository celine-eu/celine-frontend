import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The one switch, the accesses before their uses, and the history — as the onboarding wizard
 * shows them.
 *
 * A community may word one switch (`consent.data_sharing.summary` in its manifest; onboarding
 * carries it on every offer as `switch`). It ticks every consent offer and untick them all;
 * "Learn more" opens the list, where each offer keeps its own checkbox. An offer that uses
 * data another offer makes available (`requires_offers`) cannot be granted before it, and
 * withdrawing the access withdraws its uses first. Each is still its own decision: the page
 * sends one per offer, and this file records their order.
 *
 * **Stubbed**, like the pending and disclosure specs: the BFF's answer is written here and
 * kept as state, so what is asserted is the rendering and the order of the decisions, not
 * that any deployment produces the payload.
 *
 *   E2E_WEBAPP_UI_URL   http://127.0.0.1:3005   (`task dev:webapp`)
 */
const UI_URL = process.env.E2E_WEBAPP_UI_URL ?? 'http://127.0.0.1:3005';

const SWITCH = {
  en: { title: 'Access to your meter readings', label: 'Allow the grid operator to share your meter data' },
  it: { title: 'Accesso ai dati di misura', label: 'Permetti la condivisione dei tuoi dati del contatore' },
};

type Spec = { id: string; title: string; recipient: string; name: string; requires?: string[] };

const SPECS: Spec[] = [
  // The use first on purpose: the page must put each access before its uses itself.
  { id: 'example-use', title: 'Incentive estimate', recipient: 'example-rec', name: 'Example REC', requires: ['example-access'] },
  { id: 'example-access', title: 'Access to my readings', recipient: 'example-rec', name: 'Example REC' },
  { id: 'example-lab-access', title: 'Access to my readings', recipient: 'example-lab', name: 'Example Lab' },
  { id: 'example-lab-use', title: 'Forecasting models', recipient: 'example-lab', name: 'Example Lab', requires: ['example-lab-access'] },
];

const offer = (spec: Spec, granted: boolean, withSwitch: boolean) => ({
  id: spec.id,
  purpose: spec.id,
  requires_consent: true,
  can_decide: true,
  consent_text_version: '1.0',
  recipients: { recipient: spec.recipient },
  recipient_name: spec.name,
  requires_offers: spec.requires ?? [],
  text: { version: '1.0', en: { title: spec.title, body: `${spec.title}, in full.` } },
  granted,
  state: granted ? 'granted' : 'withdrawn',
  evidence: granted ? { consent_text_version: '1.0' } : null,
  decided_at: granted ? '2026-09-30T10:00:00Z' : null,
  ...(withSwitch ? { switch: SWITCH } : {}),
});

type Decision = { offerId: string; enabled: boolean };

/** Stub the BFF with state: each POST changes one offer, and the answer reflects it. */
async function stub(
  page: Page,
  opts: { granted?: string[]; withSwitch?: boolean; events?: unknown[] } = {}
): Promise<Decision[]> {
  const decisions: Decision[] = [];
  const granted = new Set(opts.granted ?? []);
  const withSwitch = opts.withSwitch ?? true;
  const answer = () => ({
    has_identity: true,
    state: 'ok',
    offers: SPECS.map((s) => offer(s, granted.has(s.id), withSwitch)),
    identity: null,
    asked: true,
    review_due: false,
  });
  await page.route(
    (url) => url.pathname.startsWith('/api/data-sharing'),
    async (route: Route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/data-sharing/history') {
        return route.fulfill({ json: { has_identity: true, state: 'ok', events: opts.events ?? [] } });
      }
      if (request.method() === 'POST' && path !== '/api/data-sharing/seen') {
        const offerId = decodeURIComponent(path.split('/').pop() ?? '');
        const { enabled } = request.postDataJSON() as { enabled: boolean };
        decisions.push({ offerId, enabled });
        if (enabled) granted.add(offerId);
        else granted.delete(offerId);
      }
      return route.fulfill({ json: answer() });
    }
  );
  return decisions;
}

async function open(page: Page, locale = 'en') {
  await page.addInitScript((l) => localStorage.setItem('locale', l), locale);
  await page.goto(`${UI_URL}/data-sharing`);
  await expect(page.locator('.loading-card')).toHaveCount(0, { timeout: 30_000 });
}

const master = (page: Page) => page.locator('.switch-row input[type="checkbox"]');
const row = (page: Page, id: string) => page.locator(`.offer-row[data-offer-id="${id}"]`);
const box = (page: Page, id: string) => row(page, id).locator('input[type="checkbox"]');

async function learnMore(page: Page) {
  await page.locator('.consent-card > details.more > summary').first().click();
}

test.use({ locale: 'en-GB' });

test('the switch names its parties, and the offers wait behind "Learn more"', async ({ page }) => {
  await stub(page);
  await open(page);

  await expect(page.locator('.sharing-page')).toContainText(SWITCH.en.title);
  await expect(page.locator('.switch-row')).toContainText(SWITCH.en.label);
  // Every recipient, once each, in the order their offers are shown.
  await expect(page.locator('.switch-row')).toContainText('Example REC, Example Lab');
  await expect(master(page)).not.toBeChecked();

  // One control per offer plus the switch.
  await expect(page.locator('.sharing-page input[type="checkbox"]')).toHaveCount(SPECS.length + 1);
  await expect(row(page, 'example-access')).toBeHidden();
  await learnMore(page);
  await expect(row(page, 'example-access')).toBeVisible();
  // Each row names who gets the data.
  await expect(row(page, 'example-lab-use')).toContainText('Example Lab');
});

test('an access is listed before its uses', async ({ page }) => {
  await stub(page);
  await open(page);
  const ids = await page.locator('.offer-row').evaluateAll((rows) =>
    rows.map((r) => r.getAttribute('data-offer-id'))
  );
  for (const spec of SPECS.filter((s) => s.requires)) {
    for (const required of spec.requires!) {
      expect(ids.indexOf(required)).toBeLessThan(ids.indexOf(spec.id));
    }
  }
});

test('the switch grants every offer, each access before its uses', async ({ page }) => {
  const decisions = await stub(page);
  await open(page);

  await master(page).click();

  await expect.poll(() => decisions.length).toBe(SPECS.length);
  expect(decisions.every((d) => d.enabled)).toBe(true);
  const order = decisions.map((d) => d.offerId);
  for (const spec of SPECS.filter((s) => s.requires)) {
    for (const required of spec.requires!) {
      expect(order.indexOf(required)).toBeLessThan(order.indexOf(spec.id));
    }
  }
  await expect(master(page)).toBeChecked();
  await expect(master(page)).toHaveJSProperty('indeterminate', false);
});

test('the switch withdraws every offer, each use before its access', async ({ page }) => {
  const decisions = await stub(page, { granted: SPECS.map((s) => s.id) });
  await open(page);
  await expect(master(page)).toBeChecked();

  await master(page).click();

  await expect.poll(() => decisions.length).toBe(SPECS.length);
  expect(decisions.every((d) => !d.enabled)).toBe(true);
  const order = decisions.map((d) => d.offerId);
  for (const spec of SPECS.filter((s) => s.requires)) {
    for (const required of spec.requires!) {
      expect(order.indexOf(spec.id)).toBeLessThan(order.indexOf(required));
    }
  }
  await expect(master(page)).not.toBeChecked();
});

test('some offers on: the switch is mixed', async ({ page }) => {
  await stub(page, { granted: ['example-access'] });
  await open(page);
  await expect(master(page)).toBeChecked({ indeterminate: true });
});

test('a use waits for its access, and says which', async ({ page }) => {
  await stub(page);
  await open(page);
  await learnMore(page);

  await expect(box(page, 'example-use')).toBeDisabled();
  await expect(row(page, 'example-use')).toContainText('Available once you allow');
  await expect(row(page, 'example-use')).toContainText('Access to my readings');
  // Another party's access is not this party's.
  await expect(box(page, 'example-lab-use')).toBeDisabled();

  await box(page, 'example-access').click();
  await expect(box(page, 'example-use')).toBeEnabled();
  await expect(box(page, 'example-lab-use')).toBeDisabled();
});

test('withdrawing an access withdraws its uses first', async ({ page }) => {
  const decisions = await stub(page, { granted: ['example-access', 'example-use', 'example-lab-access'] });
  await open(page);
  await learnMore(page);

  await box(page, 'example-access').click();

  await expect
    .poll(() => decisions)
    .toEqual([
      { offerId: 'example-use', enabled: false },
      { offerId: 'example-access', enabled: false },
    ]);
  await expect(box(page, 'example-lab-access')).toBeChecked();
});

test('without a switch, the offers are listed directly', async ({ page }) => {
  await stub(page, { withSwitch: false });
  await open(page);
  await expect(page.locator('.switch-row')).toHaveCount(0);
  await expect(row(page, 'example-access')).toBeVisible();
  await expect(page.locator('.sharing-page input[type="checkbox"]')).toHaveCount(SPECS.length);
});

test('the switch is written in the member\'s language', async ({ page }) => {
  await stub(page);
  await open(page, 'it');
  await expect(page.locator('.switch-row')).toContainText(SWITCH.it.label);
  await expect(page.locator('.sharing-page')).toContainText('Scopri di più');
  await expect(page.locator('.sharing-page')).not.toContainText('data_sharing.');
});

// ── the history ─────────────────────────────────────────────────────────────

/** As provenance serves them: JSON-LD, the type in `@type`, and no `event_type`. */
const EVENTS = [
  {
    '@id': 'urn:event:1',
    '@type': 'ds:ConsentGranted',
    'ds:occurredAt': '2026-09-30T10:00:00+00:00',
    'ds:offerId': 'example-use',
  },
  {
    '@id': 'urn:event:2',
    '@type': 'ds:ConsentRevoked',
    'ds:occurredAt': '2026-09-30T11:00:00+00:00',
    'ds:offerId': 'example-lab-access',
  },
  { '@id': 'urn:event:3', '@type': 'ds:SomethingNew' },
];

test('every history line says what happened, when, and to which choice', async ({ page }) => {
  await stub(page, { events: EVENTS });
  await open(page);

  const lines = page.locator('.history li');
  await expect(lines).toHaveCount(EVENTS.length);
  // The bug this guards: every line rendered empty, because the page read `event_type`.
  for (const line of await lines.all()) {
    await expect(line).not.toHaveText('');
  }
  await expect(lines.nth(0)).toContainText('You agreed to sharing.');
  await expect(lines.nth(0)).toContainText('Incentive estimate · Example REC');
  await expect(lines.nth(1)).toContainText('You withdrew your agreement.');
  await expect(lines.nth(1)).toContainText('Access to my readings · Example Lab');
  // A type nobody has written a sentence for is named rather than hidden.
  await expect(lines.nth(2)).toContainText('SomethingNew');
});

test('one decision recorded per dataset is one line, not one per record', async ({ page }) => {
  // What provenance holds for one grant of an offer bound to three datasets.
  const one = (ms: string) => ({
    '@id': `urn:event:${ms}`,
    '@type': 'ds:ConsentGranted',
    'ds:occurredAt': `2026-09-30T15:47:43.${ms}+00:00`,
    'ds:offerId': 'example-use',
  });
  await stub(page, { events: [one('119'), one('232'), one('259'), EVENTS[1]] });
  await open(page);
  await expect(page.locator('.history li')).toHaveCount(2);
});
