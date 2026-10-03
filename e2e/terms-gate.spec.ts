import { expect, test } from '@playwright/test';
import { openSignedIn } from './sign-in';

/**
 * The terms gate asks for the member's own community's documents, in their current
 * versions, when the deployment has a legal host (`GET /api/me` → `legal_documents`), and
 * records what was accepted. A member who has accepted them is not asked again.
 */
const WEBAPP_URL = process.env.E2E_WEBAPP_URL ?? 'http://webapp.celine.localhost';

type Me = {
  terms_required: boolean;
  legal_documents?: { document: string; url: string; version?: string | null; required: boolean }[] | null;
};

async function me(page: import('@playwright/test').Page): Promise<Me> {
  const response = await page.request.get(`${WEBAPP_URL}/api/me`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test("the gate shows the community's documents, and accepting them lets the member in", async ({ page }) => {
  await openSignedIn(page, WEBAPP_URL);
  const before = await me(page);
  test.skip(!before.legal_documents, 'this deployment has no legal host: the global policy gate applies');

  const required = before.legal_documents!.filter((d) => d.required);
  if (required.length) {
    await page.goto(`${WEBAPP_URL}/accept-terms`);

    // Each required document, linked where the legal host serves it, in a new tab.
    for (const doc of required) {
      const link = page.locator(`.terms-list a[href="${doc.url}"]`);
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('target', '_blank');
    }
    // The button acts only once the page is hydrated, and a click before that does nothing;
    // click until the acceptance is actually sent.
    const button = page.getByRole('button', { name: /Accetto e continuo|I accept and continue|Acepto y continúo/ });
    let accepted: import('@playwright/test').Response | undefined;
    await expect(async () => {
      [accepted] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith('/api/terms/accept'), { timeout: 2_000 }),
        button.click(),
      ]);
    }).toPass({ timeout: 20_000 });
    expect(accepted!.status()).toBe(200);
    // What was sent: each document with the version shown.
    const sent = JSON.parse(accepted!.request().postData() ?? '{}');
    expect(sent.documents).toEqual(required.map((d) => ({ document: d.document, version: d.version ?? null })));
    await page.waitForURL((u) => u.pathname === '/', { timeout: 20_000 });
  }

  const after = await me(page);
  expect(after.terms_required).toBe(false);
  expect(after.legal_documents!.every((d) => !d.required)).toBe(true);
  // A page that is not the gate opens normally: no redirect back to it.
  await page.goto(`${WEBAPP_URL}/`);
  await expect(page).not.toHaveURL(/accept-terms/);
});
