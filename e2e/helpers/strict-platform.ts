import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

export const ADMIN = { username: 'admin', password: 'admin123' };
export const TECH = { username: 'tech1', password: 'password123' };
export const VIEWER = { username: 'viewer1', password: 'password123' };
export const PLANNER = { username: 'planner1', password: 'password123' };

export function requireIsolatedPlatform() {
  const isolated = process.env.PLAYWRIGHT_BASE_URL === 'http://127.0.0.1:3000' &&
    !!process.env.DATABASE_URL?.includes('/platform_e2e?');
  if (process.env.CI === 'true' && !isolated) throw new Error('Requires isolated platform CI database');
  test.skip(!isolated, 'Requires isolated seeded platform fixture');
}

export async function signIn(page: Page, request: APIRequestContext, credentials = ADMIN) {
  requireIsolatedPlatform();
  const login = await request.post('/api/auth/login', { data: credentials });
  expect(login.status()).toBe(200);
  const body = await login.json();
  expect(body.success).toBe(true);
  expect(body.data.user.username).toBe(credentials.username);
  expect(body.data.token).toBeTruthy();
  await page.goto('/');
  await page.evaluate(token => localStorage.setItem('eam_token', token), body.data.token);
  await page.reload();
  await expect(page.getByRole('button', {name:'Account menu',exact:true})).toBeVisible({timeout:30_000});
  return {Authorization:'Bearer '+String(body.data.token)};
}

export async function openPage(page: Page, route: string, heading: string | RegExp) {
  await page.goto('/#/'+route);
  const main=page.getByRole('main');
  await expect(main.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible({timeout:25_000});
  await expect(page.getByText(/Something went wrong|Page failed to load|Application Error/i)).toHaveCount(0);
  return main;
}
export const dashboardHeading = /^Welcome back,\s+\S/;
