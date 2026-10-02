import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { apiCall, getToken, lookupAssetId } from './helpers/api';

test.describe.serial('Frontend hierarchy commissioning + component PM', () => {
  test('planner commissions assembly/part in UI and targets both with PM schedules', async ({ page, context }) => {
    const plannerToken = await getToken('planner');
    const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
    const suffix = Date.now().toString().slice(-7);
    const assemblyCode = `UAT-FE-ASM-${suffix}`;
    const partCode = `UAT-FE-PRT-${suffix}`;
    const assemblyPmTitle = `UAT Frontend Assembly PM ${suffix}`;
    const partPmTitle = `UAT Frontend Part PM ${suffix}`;

    await authenticateAs(context, 'planner');
    await page.goto(`/#/asset-detail?id=${encodeURIComponent(assetId)}`);
    await expect(page.getByText('UAT Test Pump').first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('tab', { name: /Components/i }).click();
    const commissionButton = page.getByRole('button', { name: /Commission Hierarchy/i }).first();
    await expect(commissionButton).toBeVisible({ timeout: 15_000 });
    await commissionButton.click();

    await expect(page.getByText('Bulk Hierarchy Commissioning')).toBeVisible();
    const hierarchyText = [
      'componentCode,name,componentType,parentCode,criticality,manufacturer,modelNumber,description',
      `${assemblyCode},Frontend Test Drive Assembly,assembly,,high,,,Browser-created UAT assembly`,
      `${partCode},Frontend Test Bearing,part,${assemblyCode},high,SKF,6205-2RS,Browser-created UAT part`,
    ].join('\n');
    await page.locator('textarea').first().fill(hierarchyText);
    await expect(page.getByText('Ready to import')).toBeVisible();
    await page.getByRole('button', { name: /Import 2 Nodes/i }).click();
    await expect(page.getByText('Bulk Hierarchy Commissioning')).toBeHidden({ timeout: 20_000 });

    await expect(page.getByText(assemblyCode, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(partCode, { exact: false }).first()).toBeVisible({ timeout: 20_000 });

    const assemblyState = await apiCall(plannerToken, 'GET', `/api/component-registry?assetId=${encodeURIComponent(assetId)}&search=${encodeURIComponent(assemblyCode)}&limit=10`);
    const partState = await apiCall(plannerToken, 'GET', `/api/component-registry?assetId=${encodeURIComponent(assetId)}&search=${encodeURIComponent(partCode)}&limit=10`);
    expect(assemblyState.status).toBe(200);
    expect(partState.status).toBe(200);
    const assembly = (assemblyState.data.data as any[]).find((item) => item.componentCode === assemblyCode);
    const part = (partState.data.data as any[]).find((item) => item.componentCode === partCode);
    expect(assembly?.id).toBeTruthy();
    expect(part?.id).toBeTruthy();
    expect(part?.parentId).toBe(assembly.id);

    const createPmViaUi = async (title: string, targetCode: string) => {
      await page.goto('/#/pm-schedules');
      await expect(page.getByRole('heading', { name: 'PM Schedules' })).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: /New Schedule/i }).click();
      await expect(page.getByText('PM Target — Assembly / Component / Part')).toBeVisible();

      await page.getByPlaceholder('e.g., Monthly Motor Inspection').fill(title);

      const assetLabel = page.locator('label').filter({ hasText: /^Asset/ }).first();
      const assetCombobox = assetLabel.locator('..').getByRole('combobox');
      await expect(assetCombobox).toBeEnabled({ timeout: 10_000 });
      await assetCombobox.click();
      const assetSearch = page.getByPlaceholder('Search assets by name or tag...');
      await assetSearch.fill('UAT-PUMP-001');
      await page.getByText('UAT Test Pump [UAT-PUMP-001]', { exact: true }).click();

      const targetLabel = page.locator('label').filter({ hasText: /PM Target/ }).first();
      const targetCombobox = targetLabel.locator('..').getByRole('combobox');
      await expect(targetCombobox).toBeEnabled({ timeout: 10_000 });
      await targetCombobox.click();
      await page.getByRole('option').filter({ hasText: targetCode }).click();

      const durationLabel = page.locator('label').filter({ hasText: /Est\. Duration/ }).first();
      await durationLabel.locator('..').locator('input').fill('1');

      await page.getByRole('button', { name: /Create Schedule/i }).click();
      await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(targetCode, { exact: false }).first()).toBeVisible();
    };

    await createPmViaUi(assemblyPmTitle, assemblyCode);
    await createPmViaUi(partPmTitle, partCode);

    const schedules = await apiCall(plannerToken, 'GET', `/api/pm-schedules?assetId=${encodeURIComponent(assetId)}`);
    expect(schedules.status).toBe(200);
    const assemblySchedule = (schedules.data.data as any[]).find((item) => item.title === assemblyPmTitle);
    const partSchedule = (schedules.data.data as any[]).find((item) => item.title === partPmTitle);
    expect(assemblySchedule?.componentId).toBe(assembly.id);
    expect(partSchedule?.componentId).toBe(part.id);
  });
});
