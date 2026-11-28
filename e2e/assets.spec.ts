import { test, expect } from '@playwright/test';
import { signIn, openPage, TECH } from './helpers/strict-platform';

test.describe('Asset Management',()=>{
  test.beforeEach(async({page,request})=>{
    await page.setViewportSize({width:1440,height:900});
    await signIn(page,request);
    await openPage(page,'assets-machines','Asset Register');
  });
  test('assets page loads successfully',async({page})=>{
    await expect(page.getByRole('main').getByRole('heading',{name:'Asset Register',exact:true})).toBeVisible();
  });
  test('asset list or table is visible',async({page})=>{
    const table=page.getByRole('table').filter({has:page.getByRole('columnheader',{name:'Asset Tag',exact:true})});
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader',{name:'Name',exact:true})).toBeVisible();
    await expect.poll(()=>table.locator('tbody tr').count()).toBeGreaterThan(0);
  });
  test('search/filter input is present',async({page})=>{
    const filters=page.getByTestId('assets-machines-filters');
    await expect(filters.getByPlaceholder('Search assets...')).toBeVisible();
    await expect(filters.getByRole('combobox')).toHaveCount(3);
  });
  test('can type in search input and see a genuine empty result',async({page})=>{
    const search=page.getByTestId('assets-machines-filters').getByPlaceholder('Search assets...');
    await search.fill('CI-no-such-asset-'+Date.now());
    await expect(page.getByText('No assets found',{exact:true})).toBeVisible({timeout:15_000});
    await search.clear();
    await expect(page.getByText('No assets found',{exact:true})).toBeHidden({timeout:15_000});
  });
  test('create/add button opens the actual asset form for admin',async({page})=>{
    await page.getByRole('button',{name:'Add Asset',exact:true}).click();
    await expect(page.getByTestId('asset-create-form')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading',{name:'Create Asset',exact:true})).toBeVisible();
  });
});
test('technician can view assets page',async({page,request})=>{
  await signIn(page,request,TECH);
  const main=await openPage(page,'assets-machines','Asset Register');
  await expect(main.getByTestId('assets-machines-filters')).toBeVisible();
});
