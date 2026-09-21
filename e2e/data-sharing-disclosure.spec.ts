import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * A non-consent offer is **disclosed, never offered**: a muted card, and no control of any
 * kind on it — while a consent-based offer in the same answer still gets its enabled one.
 *
 * This is the second half of the rule `data-sharing-controls.spec.ts` states, and the half
 * that has never been rendered anywhere. That spec asks a deployment, and the deployment it
 * asks publishes four offers of which every one is `dpv:Consent` — a deliberate decision,
 * not an omission: a non-consent offer is a community-grain supply to a *named counterparty*,
 * and there is none. So its check skips, loudly and permanently, and the negative half of the
 * rule went unrendered: the page could grow a switch on a disclosure and every check would
 * stay green.
 *
 * **The level is deliberate.** The rule is a *rendering* rule. Its whole input is the body of
 * `GET /api/data-sharing`, and for a rendering rule the answer's shape is the contract — so
 * writing that body here is not a mocked condition standing in for a real one, it *is* the
 * input. Which is why this file is a sibling of `data-sharing-pending.spec.ts` rather than a
 * new harness: same pattern, same `page.route` stub, same dev server, no platform.
 *
 * **What a stubbed pass settles, and what it does not.** It settles that *given* an offer with
 * `requires_consent: false`, the page mutes it, writes the contractual disclosure, and renders
 * nothing pressable on it — and that it does so while still rendering controls for the consent
 * offers beside it, which is what separates "renders the right thing" from "renders nothing".
 * It settles nothing about whether any deployment publishes such an offer, nor that onboarding
 * would spell the flag this way. That claim belongs to the live spec, and the live spec says
 * loudly that it could not make it. The two are complements: neither replaces the other.
 *
 * The payloads are built so a naive page would fail rather than pass by accident — the
 * non-consent offer carries `granted: true`, `state: 'granted'`, `evidence` and `decided_at`,
 * so anything rendering a row per offer, or rendering from `granted`, shows a checked switch
 * here. And every payload that asserts the negative contains a non-consent offer: a test that
 * "passed" because there was none would be the exact hole this file exists to close.
 *
 *   E2E_WEBAPP_UI_URL   http://127.0.0.1:3005   (`pnpm dev:webapp`) — nothing else is needed
 */
const UI_URL = process.env.E2E_WEBAPP_UI_URL ?? 'http://127.0.0.1:3005';

type Offer = Record<string, unknown>;

/** A consent-based offer: the page must give this one a control. */
const consentOffer = (id: string, title: string, state: string, granted: boolean): Offer => ({
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

/**
 * A non-consent offer: the page must give this one **nothing to press**.
 *
 * `granted: true` and a full evidence block on purpose. Nothing about a contractual basis
 * makes the flag false — the sharing does happen — and a page that renders from `granted`
 * rather than from `requires_consent` would put a checked, enabled switch on this card and an
 * evidence disclosure under it. That is the failure this payload is shaped to catch.
 */
const contractOffer = (id: string, title: string): Offer => ({
  id,
  purpose: id,
  requires_consent: false,
  can_decide: false,
  consent_text_version: '1.0',
  text: { version: '1.0', en: { title, body: `${title}.` } },
  granted: true,
  state: 'granted',
  evidence: { consent_text_version: '1.0' },
  decided_at: '2026-09-19T10:00:00Z',
});

const GRANTED = consentOffer('example-consent-granted', 'Granted consent offer', 'granted', true);
const WITHDRAWN = consentOffer(
  'example-consent-withdrawn',
  'Withdrawn consent offer',
  'withdrawn',
  false
);
// `granted: true` is what onboarding sends for a pending offer; see data-sharing-pending.
const PENDING = consentOffer('example-consent-pending', 'Pending consent offer', 'pending', true);
const CONTRACT = contractOffer('example-contract', 'Contract-based offer');

const status = (offers: Offer[]) => ({
  has_identity: true,
  state: 'ok',
  offers,
  identity: null,
  asked: true,
  review_due: false,
});

/** Stub the BFF with exactly these offers. Read-only: a POST here would be a test that
 *  pressed something, and the point of half these cards is that there is nothing to press. */
async function stubSharing(page: Page, offers: Offer[]) {
  await page.route(
    (url) => url.pathname.startsWith('/api/data-sharing'),
    async (route: Route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/data-sharing/history') {
        return route.fulfill({ json: { has_identity: true, state: 'ok', events: [] } });
      }
      return route.fulfill({ json: status(offers) });
    }
  );
}

async function open(page: Page, offers: Offer[], locale = 'en') {
  await page.addInitScript((l) => localStorage.setItem('locale', l), locale);
  await stubSharing(page, offers);
  await page.goto(`${UI_URL}/data-sharing`);
  await expect(page.locator('.loading-card')).toHaveCount(0, { timeout: 30_000 });
}

const card = (page: Page, title: string) => page.locator('.settings-card', { hasText: title });

/** Everything a member could press, in one selector: the claim is "no control", not "no
 *  checkbox". A page that replaced the switch with a button would still be wrong.
 *
 *  Always applied by chaining — `scope.locator(PRESSABLE)`, never `` `${scope} ${PRESSABLE}` ``.
 *  A selector list interpolated into a string binds the ancestor to its first member only, so
 *  the rest would match the whole document and the check would fail on the app's own chrome. */
const PRESSABLE = 'input, button, select, textarea, [role="switch"], [role="checkbox"]';

/** The disclosure, asserted the way the live spec asserts it — muted, explained, inert. */
async function expectDisclosedWithoutControl(page: Page, title: string) {
  const muted = page.locator('.settings-card--muted', { hasText: title });
  await expect(muted).toHaveCount(1);
  await expect(muted).toContainText(
    'This sharing happens under a contract rather than your consent, so there is nothing to choose.'
  );
  // Disclosed, not chosen.
  await expect(muted.locator(PRESSABLE)).toHaveCount(0);
  // And none of the vocabulary of a decision: no on/off/pending wording, no evidence record.
  await expect(muted).not.toContainText('Sharing is on');
  await expect(muted).not.toContainText('Sharing is off');
  await expect(muted).not.toContainText('Sharing is pending');
  await expect(muted.locator('details')).toHaveCount(0);
}

/** The control a consent offer must carry, in the state the answer says it is in. */
async function expectControl(page: Page, title: string, state: 'granted' | 'withdrawn' | 'pending') {
  const consent = card(page, title);
  // Not muted: the muting is the disclosure's, and a page that muted everything would
  // otherwise satisfy the negative half above.
  await expect(page.locator('.settings-card--muted', { hasText: title })).toHaveCount(0);
  const control = consent.locator('input[type="checkbox"]');
  await expect(control).toHaveCount(1);
  await expect(control).toBeEnabled();
  if (state === 'pending') {
    await expect(control).toBeChecked({ indeterminate: true });
    await expect(consent).toContainText('Sharing is pending');
    return;
  }
  await expect(control).toBeChecked({ checked: state === 'granted' });
  await expect(control).toHaveJSProperty('indeterminate', false);
  await expect(consent).toContainText(state === 'granted' ? 'Sharing is on' : 'Sharing is off');
  await expect(consent).toContainText(
    'Turning this off stops future sharing. It does not affect your membership.'
  );
}

test.use({ locale: 'en-GB' });

test('a non-consent offer is disclosed without a control, beside a consent offer that keeps one', async ({
  page,
}) => {
  // Interleaved on purpose: the page partitions the list, and an order that already grouped
  // them would not notice a partition that kept the array's order instead.
  await open(page, [GRANTED, CONTRACT, WITHDRAWN]);

  await expectDisclosedWithoutControl(page, 'Contract-based offer');
  await expectControl(page, 'Granted consent offer', 'granted');
  await expectControl(page, 'Withdrawn consent offer', 'withdrawn');

  // The invariant the live spec asserts, here against an answer that actually contains the
  // offer it can never get: one control per consent offer, and not one more.
  await expect(page.locator('.sharing-page input[type="checkbox"]')).toHaveCount(2);
  await expect(page.locator('.settings-card--muted')).toHaveCount(1);
  await expect(page.locator('.settings-card--muted').locator(PRESSABLE)).toHaveCount(0);
});

test('an answer of nothing but non-consent offers renders no control at all', async ({ page }) => {
  // The extreme the mixed test cannot reach: with no consent offer in the answer, *every*
  // control on the page is one the page invented. A hard-coded switch, or one left behind in
  // a branch, is visible here and nowhere else.
  await open(page, [CONTRACT, contractOffer('example-contract-second', 'Second contract offer')]);

  await expectDisclosedWithoutControl(page, 'Contract-based offer');
  await expectDisclosedWithoutControl(page, 'Second contract offer');
  await expect(page.locator('.sharing-page input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator('.sharing-page').locator(PRESSABLE)).toHaveCount(0);
  await expect(page.locator('.settings-card--muted')).toHaveCount(2);
});

test('all four states in one answer: three controls, one disclosure', async ({ page }) => {
  // Every state the page can render, together — which is what `data-sharing-controls.spec.ts`
  // walks live, including its `pending` branch, which no live answer there has ever entered.
  await open(page, [PENDING, CONTRACT, GRANTED, WITHDRAWN]);

  await expectControl(page, 'Granted consent offer', 'granted');
  await expectControl(page, 'Withdrawn consent offer', 'withdrawn');
  await expectControl(page, 'Pending consent offer', 'pending');
  await expectDisclosedWithoutControl(page, 'Contract-based offer');

  await expect(page.locator('.sharing-page input[type="checkbox"]')).toHaveCount(3);
  await expect(page.locator('.settings-card--muted')).toHaveCount(1);
  // A pending offer is not evidence of a settled decision, and a disclosure is not evidence
  // of a decision at all: only the granted consent offer carries the record.
  await expect(page.locator('details.evidence')).toHaveCount(1);
});

for (const [locale, sentence] of [
  ['en', 'This sharing happens under a contract rather than your consent'],
  ['it', 'Questa condivisione avviene in base a un contratto e non al tuo consenso'],
  ['es', 'Esta compartición se realiza en virtud de un contrato y no de tu consentimiento'],
] as const) {
  test(`the disclosure is written in ${locale}, and still carries no control`, async ({ page }) => {
    await open(page, [GRANTED, CONTRACT], locale);
    const muted = page.locator('.settings-card--muted', { hasText: 'Contract-based offer' });
    await expect(muted).toContainText(sentence);
    // A missing key renders as the key itself, and does not fail the build.
    await expect(muted).not.toContainText('data_sharing.');
    await expect(muted.locator(PRESSABLE)).toHaveCount(0);
    await expect(page.locator('.sharing-page input[type="checkbox"]')).toHaveCount(1);
  });
}
