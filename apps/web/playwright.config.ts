import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Koncie web app.
 *
 * Sprint 8 introduces the a11y advisory job (`tests/e2e/a11y.spec.ts`) alongside
 * the existing Sprint 2-7 happy-path specs. The CI posture matches the
 * Sprint 2-polish guidance: Playwright runs as `continue-on-error` so a flaky
 * E2E or a fresh axe finding doesn't gate a deploy. Real gating happens in
 * the verification bar (`pnpm typecheck`/`lint`/`test`/`build`) and at the
 * Sprint 8 go/no-go review.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
