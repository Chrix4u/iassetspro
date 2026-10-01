/**
 * Playwright configuration for Repairs/RWOP UAT suite (Step 12)
 *
 * This config is separate from the main playwright.config.ts so that
 * the repairs UAT tests can run independently with their own settings.
 *
 * Usage:
 *   npx playwright test --config=playwright-repairs.config.ts
 *   npx playwright test --config=playwright-repairs.config.ts --project=chromium
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/repairs',
  timeout: 60_000,
  retries: 0,
  fullyParallel: false, // Sequential — scenarios share DB state
  workers: 1, // Shared UAT actors/runtime state must never execute scenario files concurrently
  reporter: 'html',
  use: {
    baseURL: (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  // NOTE: webServer is commented out because the sandbox OOMs when running
  // the dev server. In production, uncomment to auto-start the server:
  // webServer: {
  //   command: 'bun run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});
