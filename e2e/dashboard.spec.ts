import { test, expect } from '@playwright/test';
import { signIn, openPage, dashboardHeading } from './helpers/strict-platform';
test.describe('Dashboard',()=>{
  test.beforeEach(async({page,request})=>{
    await page.setViewportSize({width:1440,height:900});
    await signIn(page,request);
    await openPage(page,'dashboard',dashboardHeading);
  });
  test('dashboard page loads after login',async({page})=>{
    await expect(page.getByRole('main').getByText('Operations Dashboard',{exact:true})).toBeVisible();
  });
  test('KPI cards are visible on dashboard',async({page})=>{
    const main=page.getByRole('main');
    for(const name of [/Active WOs/,/Pending Tasks/,/Done This Week/])
      await expect(main.getByRole('button',{name}).first()).toBeVisible();
  });
  test('navigation sidebar is present',async({page})=>{
    await expect(page.locator('aside').first()).toBeVisible();
  });
  test('sidebar contains main navigation items',async({page})=>{
    const sidebar=page.locator('aside').first();
    for(const name of ['Dashboard','Assets','Repairs Maintenance','PM Maintenance'])
      await expect(sidebar.getByText(name,{exact:true})).toBeVisible();
  });
  test('top header bar is present',async({page})=>{
    await expect(page.locator('header').getByRole('button',{name:'Account menu'})).toBeVisible();
  });
  test('user avatar is visible in header',async({page})=>{
    const menu=page.getByRole('button',{name:'Account menu'});
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.getByRole('menuitem',{name:'Sign Out'})).toBeVisible();
  });
  test('search/command palette trigger is available',async({page})=>{
    await page.locator('header').getByRole('button',{name:/Navigate/}).click();
    await expect(page.getByPlaceholder('Type a command or search...')).toBeVisible();
  });
});
