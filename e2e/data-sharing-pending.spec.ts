import { expect, test, type Page, type Response, type Route } from '@playwright/test';
import { openSignedIn } from './sign-in';

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
 * **Most of this file is against the UI dev server, with the BFF answer stubbed**
 * (`page.route`), so it runs without the platform and asserts the rendering, not the backend.
 * The page fetches its status in the browser, after mount, which is what makes the stub reach
 * it; the layout's server-side `/api/me` gets the dev server's own 404 and renders signed-out,
 * which this page does not depend on.
 *
 * **What a stubbed pass does and does not settle**, because it is easy to read it for more
 * than it says. It settles that *given* `state: "pending"`, the page renders neither on nor
 * off, keeps the control usable, and says so in three languages. It settles nothing about
 * whether any deployment ever produces that word: not that onboarding derives it, not that
 * the BFF forwards it, and not that the value is spelled `pending` on both sides of that
 * seam. A stub asserts the rendering against a payload this file wrote, so it cannot tell a
 * real answer from an invented one — which is precisely why the last test here signs in and
 * asks a live one, and says loudly when there was nothing to ask about.
 *
 *   E2E_WEBAPP_UI_URL   http://127.0.0.1:3005            (`task dev:webapp`) — the stubs
 *   E2E_WEBAPP_URL      http://webapp.celine.localhost   (behind the proxy) — the live one
 *   E2E_USER / E2E_PASSWORD  from ./sign-in
 */
const UI_URL = process.env.E2E_WEBAPP_UI_URL ?? 'http://127.0.0.1:3005';
const WEBAPP_URL = process.env.E2E_WEBAPP_URL ?? 'http://webapp.celine.localhost';

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

// ── the same claim, against a real answer ───────────────────────────────────

/**
 * Stop, naming what was missing and what would have to be true.
 *
 * Printed as well as annotated, like `data-sharing-controls.spec.ts`: `list` counts a skip
 * without its reason, and a pending check that quietly stops running leaves four green tests
 * above it saying `pending` works.
 */
function didNotRun(what: string, detail: string[]): never {
  const reason = [
    '',
    `  LIVE PENDING CHECK DID NOT RUN — ${what}`,
    ...detail.map((line) => `  ${line}`),
    '  This is a skip, not a pass. The stubbed tests above rendered a payload this file',
    '  wrote; nothing here saw a deployment produce one.',
    '',
  ].join('\n');
  console.log(reason);
  test.skip(true, reason);
  throw new Error(reason); // unreachable; satisfies `never`
}

type LiveOffer = { id: string; state?: string; granted?: boolean; text?: Record<string, unknown> };

/** The heading the page puts on an offer — mirrored from `+page.svelte`, as the controls
 *  spec does, because naming *which* card is the whole point. */
function liveTitle(offer: LiveOffer & { fallback_text_en?: { purpose_label?: string }; purpose?: string }): string {
  const text = offer.text ?? {};
  const wording = (key: string | undefined) => {
    const value = key && key !== 'version' ? text[key] : undefined;
    return value && typeof value === 'object' ? (value as { title?: string }).title : undefined;
  };
  const first = Object.keys(text).find((k) => k !== 'version');
  return wording('en') ?? wording(first) ?? offer.fallback_text_en?.purpose_label ?? offer.purpose ?? offer.id;
}

test('a live pending offer renders as pending', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  try {
    await openSignedIn(page, `${WEBAPP_URL}/data-sharing`);
  } catch (error) {
    // The stubbed tests above need no platform, and this file stays runnable without one —
    // but as a stated skip, never as four greens and a silence.
    didNotRun('no running platform answered', [
      `Opening ${WEBAPP_URL}/data-sharing and signing in failed: ${(error as Error).message
        .split('\n')[0]}`,
      'To run: a deployment serving the webapp behind its proxy, and E2E_USER/E2E_PASSWORD',
      'for a member of a community that takes part in the dataspace.',
    ]);
  }
  if (new URL(page.url()).pathname !== '/data-sharing') {
    didNotRun('the app sent this account somewhere else before the page', [
      `Signing in landed on ${new URL(page.url()).pathname}, not /data-sharing — a first-run`,
      'gate such as terms acceptance, which this check must not answer on somebody\'s behalf.',
      'To run: sign in as an account that has already been through it.',
    ]);
  }

  const [response] = await Promise.all([
    page.waitForResponse((r: Response) => new URL(r.url()).pathname === '/api/data-sharing', {
      timeout: 30_000,
    }),
    page.reload(),
  ]);
  const status = response.status();
  const body = response.ok() ? ((await response.json()) as { offers?: LiveOffer[] } | null) : null;
  await expect(page.locator('.loading-card')).toHaveCount(0, { timeout: 30_000 });

  const offers = body?.offers ?? [];
  const pendingOffers = offers.filter((o) => o.state === 'pending');
  if (pendingOffers.length === 0) {
    didNotRun('no offer this member holds is pending', [
      `GET ${WEBAPP_URL}/api/data-sharing answered ${status} with ${offers.length} offer(s),`,
      `state(s): ${offers.map((o) => `${o.id}=${o.state ?? '(absent)'}`).join(', ') || '(none)'}.`,
      'Pending is a disagreement between connectors, so producing one live needs an offer',
      'routed to more than one connector AND a decision standing at some of them and not',
      'all — a delivery that partly failed, or a withdrawal recorded at one connector only.',
      'A deployment that routes every offer to exactly one connector can never show it.',
    ]);
  }

  for (const offer of pendingOffers) {
    const pending = page.locator('.settings-card', { hasText: liveTitle(offer) });
    await expect(pending).toContainText('Sharing is pending');
    await expect(pending).not.toContainText('Sharing is on');
    await expect(pending).not.toContainText('Sharing is off');
    const control = pending.locator('input[type="checkbox"]');
    await expect(control).toHaveCount(1);
    await expect(control).toBeEnabled();
    await expect(control).toBeChecked({ indeterminate: true });
  }
});
