import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { apiCall, apiCallWithPlant, getToken, lookupAssetId, lookupPlantId } from './helpers/api';

test.describe.serial('Frontend hierarchy commissioning + component PM', () => {
  test('planner commissions assembly/part in UI and targets both with PM schedules', async ({ page, context }) => {
    const plannerToken = await getToken('planner');
    const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
    const plantId = await lookupPlantId(plannerToken, 'PLANT-A');
    const suffix = Date.now().toString().slice(-7);
    const assemblyCode = `UAT-FE-ASM-${suffix}`;
    const partCode = `UAT-FE-PRT-${suffix}`;
    const assemblyPmTitle = `UAT Frontend Assembly PM ${suffix}`;
    const partPmTitle = `UAT Frontend Part PM ${suffix}`;
    const partTaskLevelPmTitle = `UAT Frontend Task-Level Part PM ${suffix}`;
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
    await page.goto('/');
    await page.evaluate((selectedPlantId) => localStorage.setItem('user_plant_id', selectedPlantId), plantId);
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
    const templateCreate = await apiCallWithPlant(plannerToken, 'POST', '/api/pm-templates', plantId, {
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

    const templateTaskDescriptions = [
      'Inspect bearing housing and seals',
      'Measure bearing temperature and vibration',
      'Check shaft runout and alignment',
      'Lubricate bearing to specification',
      'Verify fastener torque',
      'Record readings and recommendations',
    ];
    const taskCreate = await apiCallWithPlant(
      plannerToken,
      'POST',
      `/api/pm-templates/${encodeURIComponent(templateId)}/tasks`,
      plantId,
      { newTasks: templateTaskDescriptions.map((description) => ({ description, taskType: 'mechanical' })) },
    );
    expect(taskCreate.status).toBe(201);
    expect(taskCreate.data.success).toBe(true);

    const templateState = await apiCallWithPlant(plannerToken, 'GET', '/api/pm-templates?active=true', plantId);
    expect(templateState.status).toBe(200);
    const seededTemplate = (templateState.data.data as any[]).find((item) => item.id === templateId);
    expect(seededTemplate?.title).toBe(templateTitle);
    expect(seededTemplate?._count?.tasks).toBe(6);

    // Keep browser coverage on the new task-level authoring path: asset search,
    // exact hierarchy selection and Task Library seeding from a PM template.
    const createTaskLevelPmViaUi = async (
      title: string,
      targetCode: string,
      expandParentCode?: string,
    ) => {
      await page.goto('/#/pm-schedules');
      const pmHeading = page.getByRole('main').getByRole('heading', { name: 'PM Schedules', exact: true });
      await expect(pmHeading).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: /New Schedule/i }).click();
      const scheduleHeading = page.getByRole('heading', { name: 'New PM Schedule', exact: true });
      await expect(scheduleHeading).toBeVisible({ timeout: 10_000 });
      const scheduleDialog = page.getByRole('dialog').filter({ has: scheduleHeading });
      await scheduleDialog.getByPlaceholder('e.g., Drive System Preventive Maintenance').fill(title);

      const assetLabel = scheduleDialog.locator('label').filter({ hasText: /^Asset/ }).first();
      const assetCombobox = assetLabel.locator('..').getByRole('combobox');
      await expect(assetCombobox).toBeEnabled({ timeout: 10_000 });
      await assetCombobox.click();
      const assetSearch = page.getByPlaceholder('Search assets by name or tag...');
      await assetSearch.fill('UAT-PUMP-001');
      await page.getByText('UAT Test Pump [UAT-PUMP-001]', { exact: true }).click();
      await expect(scheduleDialog.getByText('PM Target — Machine / Assembly / Component / Part')).toBeVisible({ timeout: 10_000 });

      const chooseTargetButton = scheduleDialog.getByRole('button', { name: /Choose PM Target|Change PM Target/i });
      await expect(chooseTargetButton).toBeEnabled({ timeout: 10_000 });
      await chooseTargetButton.click();
      const explorerHeading = page.getByRole('heading', { name: 'Choose PM Target', exact: true });
      await expect(explorerHeading).toBeVisible({ timeout: 20_000 });
      const explorerDialog = page.getByRole('dialog').filter({ has: explorerHeading });
      if (expandParentCode) {
        const parentNodeButton = explorerDialog.getByRole('button').filter({ hasText: expandParentCode }).first();
        await expect(parentNodeButton).toBeVisible({ timeout: 20_000 });
        const parentRow = parentNodeButton.locator('..');
        const expandParent = parentRow.getByRole('button', { name: /^Expand / });
        await expect(expandParent).toBeVisible({ timeout: 20_000 });
        await expandParent.click();
      }
      const targetNode = explorerDialog.getByRole('button').filter({ hasText: targetCode }).first();
      await expect(targetNode).toBeVisible({ timeout: 20_000 });
      await targetNode.click();
      await explorerDialog.getByRole('button', { name: 'Confirm Selection', exact: true }).click();
      await expect(explorerHeading).toBeHidden({ timeout: 10_000 });
      await expect(scheduleDialog.getByText(targetCode, { exact: false }).first()).toBeVisible();

      const templateLabel = scheduleDialog.locator('label').filter({ hasText: /Start \/ Replace Tasks from PM Template/ }).first();
      const templateCombobox = templateLabel.locator('..').getByRole('combobox');
      await expect(templateCombobox).toBeEnabled({ timeout: 10_000 });
      await templateCombobox.click();
      const templateSearch = page.getByPlaceholder('Search PM templates...');
      await templateSearch.fill(templateTitle);
      await page.getByText(`${templateTitle} · 6 tasks`, { exact: true }).click();
      await expect(scheduleDialog.getByText('Tasks & Planning', { exact: true })).toBeVisible();
      await expect(scheduleDialog.getByText(/Task #/)).toHaveCount(6, { timeout: 15_000 });

      const nextDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const dueInputs = scheduleDialog.locator('input[type="date"]');
      await expect(dueInputs).toHaveCount(6, { timeout: 10_000 });
      for (let index = 0; index < 6; index += 1) await dueInputs.nth(index).fill(nextDue);

      await scheduleDialog.getByRole('button', { name: /Create Schedule/i }).click();
      await expect(scheduleHeading).toBeHidden({ timeout: 20_000 });
      await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(targetCode, { exact: false }).first()).toBeVisible();
    };

    await createTaskLevelPmViaUi(partTaskLevelPmTitle, partCode, assemblyCode);

    // Slice 3 deliberately keeps the legacy generation engine fail-closed for new
    // task-level schedules. Seed separate compatibility schedules through the API so
    // this UAT can continue protecting the legacy generation runtime as well.
    const createLegacyPm = async (title: string, componentId: string, useTemplate = false) => {
      const created = await apiCall(plannerToken, 'POST', '/api/pm-schedules', {
        title,
        assetId,
        componentId,
        templateId: useTemplate ? templateId : null,
        frequencyType: 'time_day',
        frequencyValue: 1,
        frequencyUnit: 'months',
        nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        estimatedDuration: 1,
        priority: 'high',
        autoGenerateWO: true,
        leadDays: 3,
      });
      expect(created.status).toBe(201);
      expect(created.data.data?.componentId).toBe(componentId);
    };

    await createLegacyPm(assemblyPmTitle, assembly.id);
    await createLegacyPm(partPmTitle, part.id, true);

    await page.goto('/#/pm-schedules');
    await expect(page.getByRole('main').getByRole('heading', { name: 'PM Schedules', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(assemblyPmTitle, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(partPmTitle, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(partTaskLevelPmTitle, { exact: true })).toBeVisible({ timeout: 20_000 });

    const taskLevelScheduleRow = page.getByRole('row').filter({ hasText: partTaskLevelPmTitle });
    await expect(taskLevelScheduleRow).toBeVisible();
    await taskLevelScheduleRow.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    const viewHeading = page.getByRole('heading', { name: `PM Schedule · ${partTaskLevelPmTitle}`, exact: true });
    await expect(viewHeading).toBeVisible({ timeout: 10_000 });
    const viewDialog = page.getByRole('dialog').filter({ has: viewHeading });
    await expect(viewDialog.getByText('PM Target', { exact: true })).toBeVisible();
    await expect(viewDialog.getByText(partCode, { exact: false })).toBeVisible();
    await viewDialog.getByRole('button', { name: 'Close', exact: true }).filter({ hasText: /^Close$/ }).first().click();
    await expect(viewHeading).toBeHidden();

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
