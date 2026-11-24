import {test,expect} from '@playwright/test';
import {authenticateAs} from './helpers/auth';
import {getToken,lookupAssetId,lookupPlantId} from './helpers/api';

/**
 * No-mutating reliability-engineer interface smoke in disposable Repairs UAT.
 * No synthetic file is claimed to be a scanned customer machine or OEM CAD.
 */
test('UAT-mobile 360px: Real 3D Scan tab is navigable, responsive and truthfully empty',async({page,context})=>{
  test.skip(process.env.CI!=='true'||!(process.env.DATABASE_URL||'').includes('repairs_uat'),
    'Only run the authenticated machine explorer against the isolated Repairs UAT database');
  test.setTimeout(90_000);
  await page.setViewportSize({width:360,height:780});
  const engineer=await getToken('engineer_a');
  const assetId=await lookupAssetId(engineer,'UAT-PUMP-001');
  const plantId=await lookupPlantId(engineer,'PLANT-A');
  await authenticateAs(context,'engineer_a');
  await page.goto('/');
  await page.evaluate(id=>localStorage.setItem('user_plant_id',id),plantId);
  await page.goto('/#/asset-detail?id='+encodeURIComponent(assetId));
  await expect(page.getByText('UAT Test Pump').first()).toBeVisible({timeout:20_000});

  await page.getByRole('tab',{name:'Visual Explorer',exact:true}).click();
  const sourceTab=page.getByRole('tab',{name:/Real 3D Scan/i});
  await expect(sourceTab).toBeVisible({timeout:15_000});
  await sourceTab.click();

  const panel=page.getByTestId('smart-anatomy-site-scan');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Real Machine · 3D LiDAR / Photogrammetry')).toBeVisible();
  await expect(panel.getByText(/Scans cannot reveal hidden internal OEM components/i)).toBeVisible();
  await expect(panel.getByText(/No 3D scan selected/i)).toBeVisible();
  await panel.getByText('Import actual machine scan').click();
  await expect(panel.getByText('Capture method')).toBeVisible();
  await expect(panel.getByText(/Physical measurement used to verify GLB scale/i)).toBeVisible();
  await expect(panel.getByText(/visible surfaces only/i).first()).toBeVisible();

  // Empty state must not expose unsupported OEM exploded parts or unapproved
  // registration controls as if physical machine evidence existed.
  await expect(panel.getByText(/Source CAD ↔ Installed Machine Scan/i)).toHaveCount(0);
  await expect(panel.getByText(/Approve rigid CAD overlay for inspection/i)).toHaveCount(0);

  const bounds=await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(361);
  const tabBounds=await sourceTab.boundingBox();
  expect(tabBounds).not.toBeNull();
  expect(tabBounds!.x+tabBounds!.width).toBeLessThanOrEqual(361);
});
