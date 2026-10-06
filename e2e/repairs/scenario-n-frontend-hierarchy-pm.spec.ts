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
    const templateTitle = `UAT Frontend Bearing 500h Service ${suffix}`;
    const cycleA = `UAT-FE-CYCLE-A-${suffix}`;
    const cycleB = `UAT-FE-CYCLE-B-${suffix}`;

    const cycleAttempt = await apiCall(plannerToken, 'POST', '/api/component-registry/bulk', {
      assetId,
      rows: [
        { componentCode: cycleA, name: 'Cycle A', componentType: 'component', parentCode: cycleB, criticality: 'medium' },
        { componentCode: cycleB, name: 'Cycle B', componentType: 'component', parentCode: cycleA, criticality: 'medium' },
      ],
    });
    expect(cycleAttempt.status).toBe(400);
    expect(String(cycleAttempt.data.error || '')).toMatch(/circular|unresolved/i);

    for (const code of [cycleA, cycleB]) {
      const state = await apiCall(plannerToken, 'GET', `/api/component-registry?assetId=${encodeURIComponent(assetId)}&search=${encodeURIComponent(code)}&limit=10`);
      expect(state.status).toBe(200);
      expect((state.data.data as any[]).some((item) => item.componentCode === code)).toBe(false);
    }

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

    // This browser scenario must be self-contained. The historical RP-01 PM
    // commissioning migrations intentionally run only in the named staging DB,
    // while CI uses an isolated repairs_uat database. Create the template through
    // the same authenticated APIs a planner uses instead of depending on staging seed data.
    const templateCreate = await apiCall(plannerToken, 'POST', '/api/pm-templates', {
      title: templateTitle,
      description: 'Browser-created six-step bearing service template for PM schedule linkage UAT.',
      type: 'preventive',
      category: 'mechanical',
      estimatedDuration: 1,
      priority: 'high',
    });
    expect(templateCreate.status).toBe(201);
    expect(templateCreate.data.success).toBe(true);
    const templateId = String(templateCreate.data.data?.id || '');
    expect(templateId).toBeTruthy();

    const templateTasks = [
      ['Inspect bearing housing and seals', 'inspect'],
      ['Measure bearing temperature and vibration', 'measure'],
      ['Check shaft runout and alignment', 'measure'],
      ['Lubricate bearing to specification', 'lubricate'],
      ['Verify fastener torque', 'check'],
      ['Record readings and recommendations', 'record'],
    ] as const;
    for (const [index, [description, taskType]] of templateTasks.entries()) {
      const taskCreate = await apiCall(plannerToken, 'POST', `/api/pm-templates/${encodeURIComponent(templateId)}/tasks`, {
        taskNumber: index + 1,
        description,
        taskType,
        estimatedMinutes: 10,
      });
      expect(taskCreate.status).toBe(201);
      expect(taskCreate.data.success).toBe(true);
    }

    const templateState = await apiCall(plannerToken, 'GET', '/api/pm-templates?active=true');
    expect(templateState.status).toBe(200);
    const seededTemplate = (templateState.data.data as any[]).find((item) => item.id === templateId);
    expect(seededTemplate?.title).toBe(templateTitle);
    expect(seededTemplate?._count?.tasks).toBe(6);

    const createPmViaUi = async (title: string, targetCode: string, useTemplate = false) => {
      const pmHeading = page.getByRole('main').getByRole('heading', { name: 'PM Schedules', exact: true });
      if (!(await pmHeading.isVisible().catch(() => false))) {
        // Asset detail is rendered as a modal sheet, so return to the authenticated
        // dashboard before exercising the same visible PM quick action a planner uses.
        await page.goto('/');
        await expect(page.getByText(/Welcome back/i).first()).toBeVisible({ timeout: 20_000 });
        const pmQuickAction = page.getByRole('button', { name: 'PM Schedules', exact: true }).last();
        await expect(pmQuickAction).toBeVisible({ timeout: 20_000 });
        const analyticsResponse = page.waitForResponse((response) => response.url().includes('/api/pm-analytics'));
        await pmQuickAction.click();
        expect((await analyticsResponse).status()).toBe(200);
      }
      await expect(pmHeading).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: /New Schedule/i }).click();
      await page.getByPlaceholder('e.g., Monthly Motor Inspection').fill(title);

      if (useTemplate) {
        const templateLabel = page.locator('label').filter({ hasText: /^PM Template$/ }).first();
        const templateCombobox = templateLabel.locator('..').getByRole('combobox');
        await expect(templateCombobox).toBeEnabled({ timeout: 10_000 });
        await templateCombobox.click();
        const templateSearch = page.getByPlaceholder('Search PM templates...');
        await templateSearch.fill(templateTitle);
        await page.getByText(`${templateTitle} · 6 tasks`, { exact: true }).click();
      }

      const assetLabel = page.locator('label').filter({ hasText: /^Asset/ }).first();
      const assetCombobox = assetLabel.locator('..').getByRole('combobox');
      await expect(assetCombobox).toBeEnabled({ timeout: 10_000 });
      await assetCombobox.click();
      const assetSearch = page.getByPlaceholder('Search assets by name or tag...');
      await assetSearch.fill('UAT-PUMP-001');
      await page.getByText('UAT Test Pump [UAT-PUMP-001]', { exact: true }).click();
      await expect(page.getByText('PM Target — Assembly / Component / Part')).toBeVisible({ timeout: 10_000 });

      const targetLabel = page.locator('label').filter({ hasText: /PM Target/ }).first();
      const targetCombobox = targetLabel.locator('..').getByRole('combobox');
      await expect(targetCombobox).toBeEnabled({ timeout: 10_000 });
      await targetCombobox.click();
      const targetOption = page.getByRole('option').filter({
        hasText: new RegExp(`${targetCode}\\s*·`),
      });
      await expect(targetOption).toHaveCount(1);
      await targetOption.click();

      const durationLabel = page.locator('label').filter({ hasText: /Est\. Duration/ }).first();
      await durationLabel.locator('..').locator('input').fill('1');

      await page.getByRole('button', { name: /Create Schedule/i }).click();
      await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(targetCode, { exact: false }).first()).toBeVisible();
      if (useTemplate) {
        await expect(page.getByText(`Template · ${templateTitle} · 6 tasks`, { exact: true })).toBeVisible();
      }
    };

    await createPmViaUi(assemblyPmTitle, assemblyCode);
    await createPmViaUi(partPmTitle, partCode, true);

    const schedules = await apiCall(plannerToken, 'GET', `/api/pm-schedules?assetId=${encodeURIComponent(assetId)}`);
    expect(schedules.status).toBe(200);
    const assemblySchedule = (schedules.data.data as any[]).find((item) => item.title === assemblyPmTitle);
    const partSchedule = (schedules.data.data as any[]).find((item) => item.title === partPmTitle);
    expect(assemblySchedule?.componentId).toBe(assembly.id);
    expect(assemblySchedule?.templateId).toBeNull();
    expect(partSchedule?.componentId).toBe(part.id);
    expect(partSchedule?.templateId).toBe(templateId);
    expect(partSchedule?.template?.title).toBe(templateTitle);
    expect(partSchedule?.template?._count?.tasks).toBe(6);

    // Prove the targeted PM survives automation: force only this newly-created
    // part schedule due, execute the real PM check-due endpoint, then verify the
    // generated preventive WO links back to the exact part while retaining the
    // parent machine asset.
    const dueAt = new Date(Date.now() - 60_000).toISOString();
    const dueUpdate = await apiCall(plannerToken, 'PUT', `/api/pm-schedules/${partSchedule.id}`, {
      nextDueDate: dueAt,
      autoGenerateWO: true,
      leadDays: 0,
      isActive: true,
    });
    expect(dueUpdate.status).toBe(200);

    const generation = await apiCall(plannerToken, 'POST', '/api/pm-schedules/check-due', {});
    expect(generation.status).toBe(200);
    const generatedResult = (generation.data.data?.results as any[] | undefined)?.find(
      (item) => item.scheduleId === partSchedule.id && item.skipped === false,
    );
    expect(generatedResult?.workOrderId).toBeTruthy();

    const generatedWo = await apiCall(plannerToken, 'GET', `/api/work-orders/${generatedResult.workOrderId}`);
    expect(generatedWo.status).toBe(200);
    expect(generatedWo.data.data?.assetId).toBe(assetId);
    expect(generatedWo.data.data?.pmSchedule?.id).toBe(partSchedule.id);
    expect(
      (generatedWo.data.data?.workOrderComponents as any[] | undefined)?.some(
        (link) => link.componentRegistry?.id === part.id
          && link.componentRegistry?.componentCode === partCode,
      ),
    ).toBe(true);
  });
});
