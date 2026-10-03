import { expect, test } from '@playwright/test';
import { openSignedIn } from './sign-in';

/**
 * The member sees their own community's legal documents: the footer links each one the
 * BFF returns (`GET /api/community`, which resolves a link the registry leaves empty to
 * the legal host), and the assistant's AI notice links the community's privacy notice
 * rather than one address for the whole deployment.
 */
const WEBAPP_URL = process.env.E2E_WEBAPP_URL ?? 'http://webapp.celine.localhost';

type Community = Record<string, string | null | undefined>;

async function community(page: import('@playwright/test').Page): Promise<Community> {
  const response = await page.request.get(`${WEBAPP_URL}/api/community`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test('the footer links exactly the documents the community has', async ({ page }) => {
  await openSignedIn(page, WEBAPP_URL);
  const meta = await community(page);
  const footer = page.locator('footer');
  for (const key of ['terms_url', 'privacy_url', 'statute_url', 'regulations_url']) {
    const url = meta[key];
    if (url) {
      await expect(footer.locator(`a[href="${url}"]`)).toHaveCount(1);
    }
  }
  // A document the community has none of gets no link at all, not an empty one.
  await expect(footer.locator('a[href=""]')).toHaveCount(0);
});

test("the assistant's AI notice links the member's community privacy notice", async ({ page }) => {
  await openSignedIn(page, `${WEBAPP_URL}/assistant`);
  const meta = await community(page);
  test.skip(!meta.privacy_url, 'this community has no privacy notice to link');
  await expect(page.locator('.ai-notice').getByRole('link')).toHaveAttribute('href', meta.privacy_url!);
});
