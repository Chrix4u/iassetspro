import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const useProductionServer = process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER === '1';
const repairsTests = /repairs\/.*\.spec\.ts/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: repairsTests,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      testIgnore: repairsTests,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'repairs-uat',
      testMatch: repairsTests,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: useProductionServer
      ? 'NODE_ENV=production node .next/standalone/server.js'
      : 'bun run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
