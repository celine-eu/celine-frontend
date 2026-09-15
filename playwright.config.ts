import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running platform — celine-dev's stack (`task dev:start`), where
 * every app is served by hostname behind Caddy and oauth2-proxy. Nothing is started here:
 * the apps' behaviour behind the proxy is the thing under test, and a bare `vite dev` has no
 * proxy, no session and no BFF.
 *
 * Addresses and the sign-in account come from the environment, with celine-dev's defaults:
 *   E2E_ASSISTANT_URL  http://assistant.celine.localhost
 *   E2E_WEBAPP_UI_URL / E2E_ASSISTANT_UI_URL  http://127.0.0.1:3005 / :3003  (dev servers, hit directly)
 *   E2E_USER / E2E_PASSWORD  admin / admin     (the realm import's public dev account)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
