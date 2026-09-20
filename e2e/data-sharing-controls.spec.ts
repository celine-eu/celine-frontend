import { expect, test, type Page, type Response } from '@playwright/test';
import { openSignedIn } from './sign-in';

/**
 * A member's own data-sharing page, signed in through oauth2-proxy: the place a sharing
 * decision can be changed or withdrawn. The onboarding wizard holds no session once somebody
 * is approved, so it can only ever *grant* — withdrawing has to be as easy as granting was
 * (GDPR Art. 7(3)), and this page is the only place it happens.
 *
 * Two rules, and they fail in opposite directions:
 *
 * - every consent-based offer carries a control, enabled. A page that discloses a consent
 *   without offering the way back leaves the member with no way to withdraw it.
 * - a contract-based offer carries none. A switch over something consent did not grant tells
 *   the member they chose it, which is what invalidates the consents beside it.
 *
 * Read-only, like `community-members.spec.ts`: pressing the control writes a consent decision
 * to onboarding and to the dataspace connector, which is a real change to a real record and
 * belongs to a recorded end-to-end run, not to a check that may run a hundred times. So this
 * asserts the control is *present and enabled*, never that pressing it works.
 *
 * The offers come from `GET /api/data-sharing` (webapp BFF, which forwards the member's own
 * token to onboarding, which merges the community's published offers with this member's
 * decisions). That answer is captured here and the markup is asserted against it, so the two
 * halves cannot both drift the same way. When it carries no offer of a kind, the half that
 * needs one *skips and says so* rather than passing over an empty list — see the loud skips
 * below, in the spirit of `onboarding/tests/contract/conftest.py`.
 *
 *   E2E_WEBAPP_URL   http://webapp.celine.localhost
 *   E2E_USER         admin      (from ./sign-in — the realm import's public dev account)
 *   E2E_PASSWORD     admin
 */
const WEBAPP_URL = process.env.E2E_WEBAPP_URL ?? 'http://webapp.celine.localhost';

/** The page's own reading of `GET /api/data-sharing`, narrowed to what is asserted here. */
type SharingOffer = {
  id: string;
  purpose: string;
  requires_consent: boolean;
  granted: boolean;
  /** `pending` while the connectors holding the offer's data disagree; absent from an
   *  older onboarding, whose `granted` then says it all. */
  state?: 'granted' | 'withdrawn' | 'pending';
  fallback_text_en?: { purpose_label?: string };
  text?: Record<string, unknown>;
};

type DataSharingStatus = {
  has_identity: boolean;
  state?: string | null;
  offers: SharingOffer[];
};

type Loaded = {
  /** The status code the BFF answered with — 404 when the feature is off. */
  status: number;
  /** The body, when it was an answer at all. */
  data: DataSharingStatus | null;
};

test.use({ locale: 'en-GB' });

/**
 * The heading the page puts on an offer: the community's own wording in the member's
 * language, else the dataspace's generic label, else the bare purpose. Mirrored from
 * `offerTitle()` in `+page.svelte` because naming *which* offer got a control is the whole
 * point — a check that only counted controls would pass with them on the wrong cards.
 */
function offerTitle(offer: SharingOffer): string {
  const text = offer.text ?? {};
  const wording = (key: string | undefined) => {
    const value = key && key !== 'version' ? text[key] : undefined;
    return value && typeof value === 'object' ? (value as { title?: string }).title : undefined;
  };
  const first = Object.keys(text).find((k) => k !== 'version');
  return (
    wording('en') ?? wording(first) ?? offer.fallback_text_en?.purpose_label ?? offer.purpose
  );
}

/** Sign in, open the page, and hand back the answer its own fetch got. */
async function openDataSharing(page: Page): Promise<Loaded> {
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  await openSignedIn(page, `${WEBAPP_URL}/data-sharing`);
  expect(new URL(page.url()).pathname).toBe('/data-sharing');

  // Reload rather than race the first render: the fetch is fired `onMount`, after a redirect
  // chain through oauth2-proxy that may have completed before the listener existed.
  const [response] = await Promise.all([
    page.waitForResponse((r: Response) => new URL(r.url()).pathname === '/api/data-sharing', {
      timeout: 30_000,
    }),
    page.reload(),
  ]);

  // Read the body before waiting on the DOM: the browser drops a response buffer it no longer
  // needs, and asking for it after the page has settled loses it ("No resource with given
  // identifier found") — intermittently, which is the worst way for a check to fail.
  const status = response.status();
  let data: DataSharingStatus | null = null;
  if (response.ok()) {
    try {
      data = (await response.json()) as DataSharingStatus;
    } catch {
      data = null;
    }
  }

  await expect(page.locator('.loading-card')).toHaveCount(0, { timeout: 30_000 });
  return { status, data };
}

/**
 * Stop, loudly, naming what was missing and what would have to exist.
 *
 * Printed as well as annotated: `list` counts a skip without its reason, and a check that
 * stops running quietly is worse than one that was never written — it reports green.
 */
function didNotRun(what: string, detail: string[]): never {
  const reason = [
    '',
    `  DATA-SHARING CONTROL CHECK DID NOT RUN — ${what}`,
    ...detail.map((line) => `  ${line}`),
    '  This is a skip, not a pass. Nothing about the page was checked.',
    '',
  ].join('\n');
  console.log(reason);
  test.skip(true, reason);
  throw new Error(reason); // unreachable; satisfies `never`
}

/** The states in which there are no offers to assert against, and why. */
function offersOrSkip(loaded: Loaded): SharingOffer[] {
  if (loaded.status === 404) {
    didNotRun('the webapp BFF does not serve this feature here', [
      `GET ${WEBAPP_URL}/api/data-sharing answered 404 ("Data sharing is not enabled").`,
      'celine-webapp gates these routes behind DATA_SHARING_ENABLED, which is false by',
      'default and unset in this deployment, so the page can only render its error banner.',
      'To run: set DATA_SHARING_ENABLED=true and ONBOARDING_API_URL for celine-webapp.',
    ]);
  }
  if (!loaded.data) {
    didNotRun('the webapp BFF did not answer with a status', [
      `GET ${WEBAPP_URL}/api/data-sharing answered ${loaded.status} with no readable body.`,
    ]);
  }
  if (!loaded.data.has_identity) {
    didNotRun('the signed-in member has no dataspace identity', [
      `GET ${WEBAPP_URL}/api/data-sharing answered state="${loaded.data.state}".`,
      'The page correctly shows an explanation instead of offers, so there is no offer',
      'to check. To run: sign in (E2E_USER/E2E_PASSWORD) as a member of a community that',
      'takes part in the dataspace and holds a resolved credential.',
    ]);
  }
  return loaded.data.offers ?? [];
}

test('every consent-based offer is shown with a control that can withdraw it', async ({ page }) => {
  const loaded = await openDataSharing(page);
  const offers = offersOrSkip(loaded);
  const consentOffers = offers.filter((o) => o.requires_consent);

  if (consentOffers.length === 0) {
    didNotRun('this member is offered nothing that consent grants', [
      `GET ${WEBAPP_URL}/api/data-sharing returned ${offers.length} offer(s), none with`,
      'requires_consent=true, so GDPR Art. 7(3) has nothing to apply to here.',
      'To run: publish a consent-based offer to this member\'s community and have',
      'onboarding merge it into their status.',
    ]);
  }

  // The count is the invariant's first half: a consent this page cannot take back is one the
  // member can only ever have granted.
  const controlled = page.locator('.settings-card', { has: page.locator('input[type="checkbox"]') });
  await expect(controlled).toHaveCount(consentOffers.length);

  for (const offer of consentOffers) {
    const card = page.locator('.settings-card', { hasText: offerTitle(offer) });
    const control = card.locator('input[type="checkbox"]');
    await expect(control).toHaveCount(1);
    await expect(control).toBeEnabled();
    const state = offer.state ?? (offer.granted ? 'granted' : 'withdrawn');
    if (state === 'pending') {
      // Neither on nor off while the connectors disagree — see data-sharing-pending.spec.ts.
      await expect(control).toBeChecked({ indeterminate: true });
      await expect(card).toContainText('Sharing is pending');
      continue;
    }
    await expect(control).toBeChecked({ checked: state === 'granted' });
    // The control has to say which way it is pointing, and what turning it off costs.
    await expect(card).toContainText(state === 'granted' ? 'Sharing is on' : 'Sharing is off');
    await expect(card).toContainText(
      'Turning this off stops future sharing. It does not affect your membership.'
    );
  }
});

test('a contract-based offer is disclosed without a control', async ({ page }) => {
  const loaded = await openDataSharing(page);
  const offers = offersOrSkip(loaded);
  const disclosed = offers.filter((o) => !o.requires_consent);

  if (disclosed.length === 0) {
    didNotRun('no contract-based offer reaches this member', [
      `GET ${WEBAPP_URL}/api/data-sharing returned ${offers.length} offer(s), all with`,
      'requires_consent=true. The half of the rule that says a contract-based offer gets',
      'NO control cannot be checked against a page that was never asked to render one.',
      'To run: the member\'s community must publish an offer under a non-consent legal',
      'basis (dpv:Contract), and onboarding must merge it into their status. In the',
      'demo3 dataspace, governance/sharing-offers.yaml publishes four offers and every',
      'one of them is dpv:Consent; the dpv:Contract offers live in the connector\'s own',
      'governance-rec/sharing-offers.yaml, which is not what this page is served.',
    ]);
  }

  for (const offer of disclosed) {
    const card = page.locator('.settings-card--muted', { hasText: offerTitle(offer) });
    await expect(card).toHaveCount(1);
    // Disclosed, not chosen: no switch, no button, nothing to press.
    await expect(card.locator('input, button, select, [role="switch"]')).toHaveCount(0);
    await expect(card).toContainText(
      'This sharing happens under a contract rather than your consent, so there is nothing to choose.'
    );
  }
});

test('no control appears without a consent-based offer behind it', async ({ page }) => {
  const loaded = await openDataSharing(page);

  // Deliberately not skipped: this one runs in every state the page can be in, including the
  // ones the two checks above skip over. It is the rule read the other way round — a control
  // is only ever justified by an offer consent grants — and it holds just as much when the
  // answer carries no offers at all, which is when a hard-coded switch, a control left behind
  // in the error branch, or a toggle rendered beside a disclosure would be invisible to the
  // checks above. It proves less the emptier the answer is, so it prints what it had.
  const consentOffers = (loaded.data?.offers ?? []).filter((o) => o.requires_consent);
  if (consentOffers.length === 0) {
    console.log(
      [
        '',
        '  DATA-SHARING CONTROL CHECK RAN AGAINST AN EMPTY ANSWER',
        `  GET ${WEBAPP_URL}/api/data-sharing answered ${loaded.status}` +
          (loaded.data ? ` state="${loaded.data.state}"` : '') +
          ` with ${loaded.data?.offers?.length ?? 0} offer(s).`,
        '  This check passing means only that the page rendered no control it could not',
        '  justify. It does NOT mean a consent offer was rendered with one.',
        '',
      ].join('\n')
    );
  }

  await expect(page.locator('.sharing-page input[type="checkbox"]')).toHaveCount(
    consentOffers.length
  );
  await expect(page.locator('.settings-card--muted input, .settings-card--muted button')).toHaveCount(0);
});
