import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { apiCall, apiCallWithPlant, getToken, lookupAssetId, lookupPlantId } from './helpers/api';

test.describe.serial('Frontend hierarchy commissioning + component PM', () => {
  test('planner commissions assembly/part in UI, creates a direct PM assignment, and preserves legacy schedule compatibility', async ({ page, context }) => {
    const plannerToken = await getToken('planner');
    const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
    const plantId = await lookupPlantId(plannerToken, 'PLANT-A');
    const suffix = Date.now().toString().slice(-7);
    const assemblyCode = `UAT-FE-ASM-${suffix}`;
    const partCode = `UAT-FE-PRT-${suffix}`;
    const assemblyPmTitle = `UAT Frontend Assembly PM ${suffix}`;
    const partPmTitle = `UAT Frontend Part PM ${suffix}`;
    const directTaskDescription = `Inspect frontend test bearing ${suffix}`;
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
      directTaskDescription,
      `Measure frontend bearing temperature and vibration ${suffix}`,
      `Check frontend shaft runout and alignment ${suffix}`,
      `Lubricate frontend bearing to specification ${suffix}`,
      `Verify frontend fastener torque ${suffix}`,
      `Record frontend readings and recommendations ${suffix}`,
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

    // Keep browser coverage on the canonical direct-assignment authoring path:
    // machine search, exact hierarchy selection and Task Library reuse.
    const createDirectPmAssignmentViaUi = async (
      taskDescription: string,
      targetCode: string,
      expandParentCode?: string,
    ) => {
      await page.goto('/#/pm-schedules');
      await expect(page.getByRole('main').getByRole('heading', { name: 'PM Planning', exact: true })).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: /New PM Assignment/i }).click();
      const assignmentHeading = page.getByRole('heading', { name: 'New PM Assignment', exact: true });
      await expect(assignmentHeading).toBeVisible({ timeout: 10_000 });
      const assignmentDialog = page.getByRole('dialog').filter({ has: assignmentHeading });

      const assetCombobox = assignmentDialog.getByRole('combobox', { name: 'Select machine / asset' });
      await expect(assetCombobox).toBeEnabled({ timeout: 10_000 });
      await assetCombobox.click();
      const assetSearch = page.getByPlaceholder('Search asset name or tag...');
      await assetSearch.fill('UAT-PUMP-001');
      await page.getByText('UAT Test Pump [UAT-PUMP-001]', { exact: true }).click();

      const taskCombobox = assignmentDialog.getByRole('combobox', { name: 'Select Task Library task' });
      await expect(taskCombobox).toBeEnabled({ timeout: 10_000 });
      await taskCombobox.click();
      const taskSearch = page.getByPlaceholder('Search Task # or description...');
      await taskSearch.fill(taskDescription);
      await page.getByText(taskDescription, { exact: false }).last().click();

      const chooseTargetButton = assignmentDialog.getByRole('button', { name: /Choose PM Target/i });
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
      await explorerDialog.getByRole('button', { name: 'Use Selected Target', exact: true }).click();
      await expect(explorerHeading).toBeHidden({ timeout: 10_000 });
      await expect(assignmentDialog.getByText(targetCode, { exact: false }).first()).toBeVisible();

      const nextDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const dueInput = assignmentDialog.locator('input[type="date"]');
      await expect(dueInput).toHaveCount(1);
      await dueInput.fill(nextDue);
      await assignmentDialog.getByRole('button', { name: 'Create PM Assignment', exact: true }).click();
      await expect(assignmentHeading).toBeHidden({ timeout: 20_000 });
      await expect(page.getByText(taskDescription, { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(targetCode, { exact: false }).first()).toBeVisible();
    };

    await createDirectPmAssignmentViaUi(directTaskDescription, partCode, assemblyCode);

    const directAssignments = await apiCallWithPlant(
      plannerToken,
      'GET',
      `/api/pm-assignments?assetId=${encodeURIComponent(assetId)}`,
      plantId,
    );
    expect(directAssignments.status).toBe(200);
    const directAssignment = (directAssignments.data.data as any[]).find(
      (item) => item.pmTask?.description === directTaskDescription,
    );
    expect(directAssignment?.scheduleId).toBeNull();
    expect(directAssignment?.assetId).toBe(assetId);
    expect(directAssignment?.componentId).toBe(part.id);
    expect(directAssignment?.pmType).toBe('tbm');

    // Keep the legacy generation engine covered separately from canonical direct assignments.
    // Seed compatibility schedules through the API so
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

    // The legacy schedules were created out-of-band through the compatibility API while
    // this SPA route was already mounted. Reload once so the page re-fetches server state
    // before asserting direct assignments and legacy schedule history render together.
    await page.goto('/#/pm-schedules');
    await page.reload();
    await expect(page.getByRole('main').getByRole('heading', { name: 'PM Planning', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Direct PM Assignments', { exact: true })).toBeVisible();
    await expect(page.getByText('Legacy PM Schedules', { exact: true })).toBeVisible();
    await expect(page.getByText(directTaskDescription, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(assemblyPmTitle, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(partPmTitle, { exact: true })).toBeVisible({ timeout: 20_000 });

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
