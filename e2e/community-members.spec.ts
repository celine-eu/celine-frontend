import { expect, test } from '@playwright/test';
import { openSignedIn } from './sign-in';

/**
 * The REC Manager Dashboard's members page, signed in through oauth2-proxy: members are
 * listed by name and key, an operator holding `members.invite` is offered both email
 * actions, and no address reaches the page. Read-only: pressing a button changes an
 * account and sends mail, so that half belongs to the recorded end-to-end run
 * (celine-dev playbook `proving-the-participant-invitation-locally`).
 *
 *   E2E_COMMUNITY_URL  http://community.celine.localhost
 *   E2E_REC            example-rec   (a community in rec-registry, with members)
 *   E2E_MEMBER_KEY     ex-00001    (a member of it)
 */
const COMMUNITY_URL = process.env.E2E_COMMUNITY_URL ?? 'http://community.celine.localhost';
const REC = process.env.E2E_REC ?? 'example-rec';
const MEMBER_KEY = process.env.E2E_MEMBER_KEY ?? 'ex-00001';

test.use({ locale: 'en-GB' });

test('members are listed by name and key, with both email actions and no address', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  await openSignedIn(page, `${COMMUNITY_URL}/${REC}/members`);

  const filters = page.locator('form.filters');
  await expect(filters).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`nav a[href="/${REC}/members"]`).first()).toBeVisible();

  await page.locator('label.search input').fill(MEMBER_KEY);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/communities/${REC}/members?`) && r.ok()),
    filters.locator('button[type="submit"]').click(),
  ]);

  const row = page.locator('tr', { has: page.locator(`code:text-is("${MEMBER_KEY}")`) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Send invitation' })).toHaveCount(1);
  await expect(row.getByRole('button', { name: 'Reset password' })).toHaveCount(1);

  // Seeded members' addresses are <key>@celine.localhost; onboarded ones are real addresses.
  expect(await page.content()).not.toMatch(/[\w.+-]+@(celine\.localhost|example\.test)/);
});
