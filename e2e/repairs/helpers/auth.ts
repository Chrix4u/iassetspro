/**
 * Playwright UAT Auth Helper
 *
 * Provides login-as utility for each UAT user. The app uses a Bearer token
 * stored in localStorage under the key 'eam_token', set by the /api/auth/login
 * endpoint. We login via API, grab the token, and inject it into the browser
 * context so the SPA recognises the session.
 */

import { type BrowserContext, type Page, expect } from '@playwright/test';

// ── UAT credentials ────────────────────────────────────────────────────────
export const UAT_PASSWORD = 'TestPass123!';

export interface UatUser {
  username: string;
  password: string;
}

// All UAT test users share the same password
const USERS: Record<string, UatUser> = {
  requester:              { username: 'uat_requester',      password: UAT_PASSWORD },
  supervisor:             { username: 'uat_supervisor',     password: UAT_PASSWORD },
  planner:                { username: 'uat_planner',        password: UAT_PASSWORD },
  tech_single:            { username: 'uat_tech_single',    password: UAT_PASSWORD },
  tech_leader:            { username: 'uat_tech_leader',    password: UAT_PASSWORD },
  tech_assistant:         { username: 'uat_tech_assistant', password: UAT_PASSWORD },
  storekeeper:            { username: 'uat_storekeeper',    password: UAT_PASSWORD },
  plant_a_user:           { username: 'uat_plant_a_user',   password: UAT_PASSWORD },
  plant_b_user:           { username: 'uat_plant_b_user',   password: UAT_PASSWORD },
};

const DEFAULT_BASE_URL = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Login via the API and return the session token */
async function loginViaApi(user: UatUser, baseURL: string): Promise<string> {
  const res = await fetch(`${baseURL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: user.password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed for ${user.username}: ${res.status} ${body}`);
  }

  const json = await res.json();
  if (!json.success || !json.data?.token) {
    throw new Error(`Login returned no token for ${user.username}: ${JSON.stringify(json)}`);
  }

  return json.data.token as string;
}

/**
 * Inject auth state into the browser context so the SPA is already logged in.
 * The auth store will read eam_token on mount and populate the remaining user,
 * role, permission and plant state through /api/auth/me.
 */
export async function authenticateAs(
  context: BrowserContext,
  userKey: string,
  baseURL: string = DEFAULT_BASE_URL,
): Promise<void> {
  const user = USERS[userKey];
  if (!user) throw new Error(`Unknown UAT user key: ${userKey}`);

  const token = await loginViaApi(user, baseURL);

  await context.addInitScript((tok) => {
    localStorage.setItem('eam_token', tok);
  }, token);
}

/**
 * Login as a user via the UI (form-based login).
 * Returns after the dashboard is visible.
 * Use this when you need to test the login flow itself.
 */
export async function loginViaUI(
  page: Page,
  userKey: string,
): Promise<void> {
  const user = USERS[userKey];
  if (!user) throw new Error(`Unknown UAT user key: ${userKey}`);

  await page.goto('/');
  await expect(page.locator('input[placeholder="Enter your username"]')).toBeVisible({ timeout: 15_000 });
  await page.fill('input[placeholder="Enter your username"]', user.username);
  await page.fill('input[placeholder="Enter your password"]', user.password);
  await page.click('button[type="submit"]');

  // Wait for the SPA to render the dashboard
  await page.waitForURL(/#\/(dashboard|maintenance)/, { timeout: 20_000 });
}

/**
 * Switch users within the same browser context.
 * Clears existing auth and authenticates as the new user.
 */
export async function switchUser(
  page: Page,
  context: BrowserContext,
  userKey: string,
  baseURL: string = DEFAULT_BASE_URL,
): Promise<void> {
  // Clear existing auth
  await page.evaluate(() => {
    localStorage.removeItem('eam_token');
    localStorage.removeItem('user_permissions');
    localStorage.removeItem('user_roles');
    localStorage.removeItem('user_plant_id');
    localStorage.removeItem('user_plant_access');
  });

  // Re-authenticate as new user
  await authenticateAs(context, userKey, baseURL);

  // Reload so the SPA picks up the new token
  await page.goto('/');
  // Wait for app shell to render (sidebar indicates loaded SPA)
  await page.waitForSelector('[data-sidebar]', { timeout: 10_000 });
  await expect(page.locator('body')).not.toHaveText('Sign in', { timeout: 10_000 });
}

// ── Navigation helpers ─────────────────────────────────────────────────────

/** Navigate to the maintenance requests page (hash-based SPA routing) */
export async function navigateToMRList(page: Page): Promise<void> {
  await page.goto('/#/maintenance-requests');
  await expect(page.getByText(/Maintenance Request|Requests/i).first()).toBeVisible({ timeout: 15_000 });
}

/** Navigate to the work orders page */
export async function navigateToWOList(page: Page): Promise<void> {
  await page.goto('/#/maintenance-work-orders');
  await expect(page.getByText(/Work Order/i).first()).toBeVisible({ timeout: 15_000 });
}

/** Navigate the authenticated SPA to a specific work order detail by ID. */
export async function navigateToWODetail(page: Page, woId: string): Promise<void> {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('body')).not.toContainText('Sign in', { timeout: 20_000 });

  await page.evaluate(({ id }) => {
    const state = { eam_nav: true, page: 'wo-detail', params: { id } };
    window.history.pushState(state, '', `#/wo-detail?id=${encodeURIComponent(id)}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  }, { id: woId });

  // wo-detail is a standalone page. The UI renders woNumber rather than the
  // raw database UUID, so assert the page header and server lookup result.
  await expect(page.getByText(/^WO-[A-Z0-9-]+$/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('body')).not.toContainText('Work order not found');
}

/** Assert the human-visible WO status rendered by StatusBadge */
export async function expectWODetailStatus(page: Page, status: string): Promise<void> {
  const expectedLabel = status.replace(/_/g, ' ');
  const statusPattern = new RegExp('^' + expectedLabel + '$', 'i');
  await expect(page.getByText(statusPattern).first()).toBeVisible({ timeout: 10_000 });
}

/** Navigate to the repairs dashboard */
export async function navigateToRepairsDashboard(page: Page): Promise<void> {
  await page.goto('/#/repairs-dashboard');
  await expect(page.getByText(/Repairs|Maintenance/i).first()).toBeVisible({ timeout: 15_000 });
}

/** Wait for the app to be in a loaded state (login page or dashboard) */
export async function waitForAppReady(page: Page): Promise<void> {
  try {
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 5_000 });
    // Login page visible — not authenticated
  } catch {
    // No login form — should be authenticated; wait for sidebar/content
    await page.waitForSelector('[data-sidebar], nav, main', { timeout: 10_000 });
  }
}

/** Get the currently authenticated user's token from the page */
export async function getCurrentToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    return localStorage.getItem('eam_token');
  });
}
