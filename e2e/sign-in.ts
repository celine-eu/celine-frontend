import { expect, type Page } from '@playwright/test';

export const E2E_USER = process.env.E2E_USER ?? 'admin';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'admin';

/**
 * Opens `url` and completes the sign-in oauth2-proxy sends it to. Handles both Keycloak login
 * shapes: one form with username and password, and the identity-first pair of pages a realm
 * shows after `celine-policies keycloak sync`.
 */
export async function openSignedIn(page: Page, url: string): Promise<void> {
  await page.goto(url);

  const target = new URL(url).host;
  if (new URL(page.url()).host === target) return;

  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill(E2E_USER);
  if (!(await page.locator('#password').isVisible())) {
    await page.locator('#kc-login').click();
  }
  await page.locator('#password').fill(E2E_PASSWORD);
  await page.locator('#kc-login').click();

  await page.waitForURL((u) => u.host === target, { timeout: 30_000 });
}
