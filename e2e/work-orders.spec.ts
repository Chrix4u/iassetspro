import { test, expect } from '@playwright/test';
import { signIn, openPage } from './helpers/strict-platform';
test.describe('Work Orders',()=>{
 test.beforeEach(async({page,request})=>{
   await page.setViewportSize({width:1440,height:900});
   await signIn(page,request);
   await openPage(page,'maintenance-work-orders','Work Orders');
   await expect(page.getByRole('columnheader',{name:'WO #',exact:true})).toBeVisible();
 });
 test('work orders page loads successfully',async({page})=>{
   await expect(page.getByRole('main').getByText('Total WOs',{exact:true})).toBeVisible();
 });
 test('work order list or table is visible',async({page})=>{
   await expect(page.getByRole('columnheader',{name:'Title',exact:true})).toBeVisible();
   await expect(page.getByRole('columnheader',{name:'Status',exact:true})).toBeVisible();
 });
 test('status filters are available',async({page})=>{
   await expect(page.getByRole('combobox').filter({hasText:'All Status'})).toBeVisible();
   await expect(page.getByRole('combobox').filter({hasText:'All Priority'})).toBeVisible();
 });
 test('can click a status filter',async({page})=>{
   await page.getByRole('combobox').filter({hasText:'All Status'}).click();
   await page.getByRole('option',{name:'Completed',exact:true}).click();
   await expect(page.getByRole('combobox').filter({hasText:'Completed'})).toBeVisible();
   const rows=page.getByRole('table').filter({has:page.getByRole('columnheader',{name:'WO #'})}).locator('tbody tr');
   await expect.poll(async()=>rows.evaluateAll(items=>items.every(r=>r.textContent?.includes('No work orders found')||r.children[4]?.textContent?.trim().toLowerCase()==='completed'))).toBe(true);
 });
 test('create work order button is present',async({page})=>{
   await page.getByRole('button',{name:'New Work Order',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Create Work Order'});
   await expect(dialog).toBeVisible();
   await expect(dialog.getByRole('button',{name:'Create WO',exact:true})).toBeVisible();
 });
 test('work order items have clickable rows or links',async({page})=>{
   const table=page.getByRole('table').filter({has:page.getByRole('columnheader',{name:'WO #'})});
   const row=table.locator('tbody tr').filter({has:page.getByRole('button',{name:'Open Work Order',exact:true})}).first();
   await expect(row).toBeVisible();
   const title=await row.locator('td').nth(1).innerText();
   expect(title.trim()).not.toBe('');
   await row.getByRole('button',{name:'Open Work Order',exact:true}).click();
   await expect(page.getByRole('main').getByRole('heading',{name:title,exact:true}).first()).toBeVisible({timeout:25_000});
   await expect(page).toHaveURL(/#\/wo-detail\?/);
 });
});
