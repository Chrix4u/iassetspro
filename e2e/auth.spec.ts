import { test, expect, type Page } from '@playwright/test';
import { ADMIN, requireIsolatedPlatform, dashboardHeading } from './helpers/strict-platform';
async function loginForm(page:Page){
  requireIsolatedPlatform();
  await page.goto('/');
  await expect(page.getByPlaceholder('Enter your username')).toBeVisible({timeout:20_000});
}
async function performLogin(page:Page,username:string,password:string){
  await page.getByPlaceholder('Enter your username').fill(username);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.locator('button[type="submit"]').click();
}
async function expectDashboard(page:Page){
  await expect(page.getByRole('main').getByRole('heading',{name:dashboardHeading})).toBeVisible({timeout:30_000});
}
test.describe('Authentication Flow',()=>{
  test.beforeEach(async({page})=>{await loginForm(page);});
  test('loads the login page successfully',async({page})=>{
    await expect(page.getByText('Welcome Back',{exact:true})).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });
  test('displays forgot password link',async({page})=>{
    await expect(page.getByText('Forgot password?',{exact:true})).toBeVisible();
  });
  test('displays demo accounts section',async({page})=>{
    await expect(page.getByText('Demo Accounts',{exact:true})).toBeVisible();
  });
  test('shows error on invalid credentials',async({page})=>{
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login'&&r.request().method()==='POST');
    await performLogin(page,'invalid_user','wrong_pass');
    expect((await response).status()).toBe(401);
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible();
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible();
  });
  test('redirects to dashboard on valid login',async({page})=>{
    await performLogin(page,ADMIN.username,ADMIN.password);
    await expectDashboard(page);
  });
  test('persist login across page reload',async({page})=>{
    await performLogin(page,ADMIN.username,ADMIN.password);
    await expectDashboard(page);
    await page.reload();
    await expectDashboard(page);
  });
  test('logout redirects back to login page',async({page})=>{
    await performLogin(page,ADMIN.username,ADMIN.password);
    await expectDashboard(page);
    await page.getByRole('button',{name:'Account menu'}).click();
    await page.getByRole('menuitem',{name:'Sign Out'}).click();
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible({timeout:20_000});
    expect(await page.evaluate(()=>localStorage.getItem('eam_token'))).toBeNull();
    await page.reload();
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible();
    await expect(page.getByRole('button',{name:'Account menu'})).toHaveCount(0);
  });
});
