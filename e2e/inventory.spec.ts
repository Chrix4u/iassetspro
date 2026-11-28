import { test, expect } from '@playwright/test';
import { signIn, openPage } from './helpers/strict-platform';
test.describe('Inventory Management',()=>{
  test.beforeEach(async({page,request})=>{
    await page.setViewportSize({width:1440,height:900});
    await signIn(page,request);
    await openPage(page,'inventory-items','Inventory');
    await expect(page.getByRole('columnheader',{name:'Item Code',exact:true})).toBeVisible();
  });
  test('inventory page loads successfully',async({page})=>{
    await expect(page.getByRole('main').getByText('Total Items',{exact:true})).toBeVisible();
  });
  test('inventory items table or list is visible',async({page})=>{
    await expect(page.getByRole('columnheader',{name:'Stock Level',exact:true})).toBeVisible();
    await expect(page.getByRole('columnheader',{name:'Unit Cost',exact:true})).toBeVisible();
  });
  test('search input is present and functional',async({page})=>{
    const search=page.getByPlaceholder('Search inventory...');
    await search.fill('CI-no-such-item-'+Date.now());
    await expect(page.getByText('No items found',{exact:true})).toBeVisible();
    await search.clear();
    await expect(page.getByText('No items found',{exact:true})).toBeHidden();
  });
  test('category or part type filters are available',async({page})=>{
    await expect(page.getByRole('combobox').filter({hasText:'All Categories'})).toBeVisible();
    await expect(page.getByLabel('Low Stock Only')).toBeVisible();
  });
  test('can interact with a category filter',async({page})=>{
    const filter=page.getByRole('combobox').filter({hasText:'All Categories'});
    await filter.click();
    await page.getByRole('option',{name:'Spare Part',exact:true}).click();
    await expect(page.getByRole('combobox').filter({hasText:'Spare Part'})).toBeVisible();
    const rows=page.getByRole('table').filter({has:page.getByRole('columnheader',{name:'Item Code'})}).locator('tbody tr');
    await expect.poll(async()=>rows.evaluateAll(items=>items.every(r=>r.textContent?.includes('No items found')||r.children[2]?.textContent?.trim()==='spare part'))).toBe(true);
  });
  test('stock alert indicators are visible',async({page})=>{
    await expect(page.getByRole('main').getByText('Low Stock',{exact:true})).toBeVisible();
    await page.getByLabel('Low Stock Only').check();
    await expect(page.getByLabel('Low Stock Only')).toBeChecked();
  });
  test('create/add inventory item button is present',async({page})=>{
    await page.getByRole('button',{name:'Add Item',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Add Inventory Item',exact:true})).toBeVisible();
  });
  test('inventory items have identifiable rows or cards',async({page})=>{
    const rows=page.getByRole('table').filter({has:page.getByRole('columnheader',{name:'Item Code'})}).locator('tbody tr');
    await expect(page.getByText('No items found',{exact:true})).toBeHidden();
    await expect(rows.first().locator('td').nth(0)).not.toBeEmpty();
    await expect(rows.first().locator('td').nth(1)).not.toBeEmpty();
  });
});
