import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';

/**
 * Digital version of the Mercerizer running/standstill paper checklist.
 * Real planner authentication and UI, deterministic mocked task/read endpoints.
 * No production DB records or maintenance work orders are created by this test.
 */
test('UAT-machine-checklist: running parts, actual readings, corrective draft, and standstill mode', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateAs(context, 'planner');

  const posted: Array<{ pointId: string; requestKey: string; value: string; outcome: string; findings: string; equipmentState: string }> = [];
  const machine = { id: 'uat-pump-mobile', name: 'Mercerizer C314 UAT', assetTag: 'C314-UAT', plantId: 'uat-plant', description: 'Mercerizing production line', location: 'Plant A' };
  const bearing = {
    id: 'bearing', name: 'Drive-End Bearing', componentCode: 'C314-21-02', componentType: 'part',
    hierarchyPath: [
      { id: 'assembly', code: 'C314-21', name: 'Drive Assembly', type: 'assembly' },
      { id: 'bearing', code: 'C314-21-02', name: 'Drive-End Bearing', type: 'part' },
    ],
  };
  const pulley = { id: 'pulley', name: 'Drive pulley', componentCode: 'C314-05-46', componentType: 'part' };
  const tasks = [
    {
      id: 'task-bearing', componentId: bearing.id, component: bearing,
      pmTask: { id: 'pm-vib', taskNumber: 8, description: 'Check bearing vibration and temperature', taskType: 'measure' },
      pmType: 'tbm', basis: 'calendar', nextDueDate: '2026-11-09T00:00:00Z',
      nextDueReading: null, equipmentState: 'running',
    },
    {
      id: 'task-pulley', componentId: pulley.id, component: pulley,
      pmTask: { id: 'pm-sound', taskNumber: 9, description: 'Listen for rubbing and unusual belt sound', taskType: 'inspect' },
      pmType: 'tbm', basis: 'calendar', nextDueDate: '2026-11-09T00:00:00Z',
      nextDueReading: null, equipmentState: 'running',
    },
  ];
  const vibration = {
    id: 'vibration', componentId: bearing.id, name: 'Vibration',
    description: 'Measure RMS vibration at the bearing', inspectionType: 'measurement',
    parameterKey: 'vibration', normalRange: '{"min":0,"max":4.5,"unit":"mm/s"}',
    frequency: 'weekly', nextInspection: '2026-11-09T00:00:00Z', dueState: 'due_today',
    latestRecord: null, openCorrectiveWorkOrder: null,
  };
  const sound = {
    id: 'sound', componentId: pulley.id, name: 'Unusual noise',
    description: 'Listen for rattling or rubbing', inspectionType: 'visual',
    parameterKey: null, normalRange: null, frequency: 'weekly',
    nextInspection: '2026-11-09T00:00:00Z', dueState: 'due_today',
    latestRecord: null, openCorrectiveWorkOrder: null,
  };

  await page.route((url) => url.pathname === '/api/assets', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [machine] }),
    });
  });
  for (const endpoint of ['/api/pm-inspections', '/api/pm-inspections/scheduled']) {
    await page.route((url) => url.pathname === endpoint, async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } }),
      });
    });
  }
  await page.route((url) => url.pathname === '/api/pm-inspections/checklist', async (route) => {
    const state = new URL(route.request().url()).searchParams.get('equipmentState');
    const standstill = state === 'standstill';
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          machine, equipmentState: state, generatedAt: '2026-11-09T00:00:00Z',
          totalAssignments: standstill ? 1 : 3,
          totalConfiguredPoints: standstill ? 0 : 2, unconfiguredTasks: 1,
          generalTasks: [{
            id: 'general', componentId: null, component: null,
            pmTask: { id: 'pm-guards', taskNumber: 1, description: 'General machine safety guards', taskType: 'inspect' },
            pmType: 'tbm', basis: 'calendar', nextDueDate: null, nextDueReading: null,
            equipmentState: standstill ? 'standstill' : 'running',
          }],
          groups: standstill ? [] : [
            { component: bearing, tasks: [tasks[0]], points: [{
              ...vibration,
              latestRecord: posted.some((entry) => entry.pointId === 'vibration')
                ? { id: 'inspection-vibration', result: 'fail', value: '7.9',
                    findings: 'High vibration at the drive bearing', inspectedAt: '2026-11-09T07:15:00Z' }
                : null,
              openCorrectiveWorkOrder: posted.some((entry) => entry.pointId === 'vibration')
                ? { id: 'wo-draft', woNumber: 'WO-UAT-CORR-01', status: 'draft' } : null,
            }] },
            { component: pulley, tasks: [tasks[1]], points: [{
              ...sound,
              latestRecord: posted.some((entry) => entry.pointId === 'sound')
                ? { id: 'inspection-sound', result: 'pass', value: null,
                    findings: 'Regular pulley sound, no rubbing or rattling', inspectedAt: '2026-11-09T07:16:00Z' }
                : null,
            }] },
          ],
        },
      }),
    });
  });
  await page.route((url) => /^\/api\/pm-inspections\/(vibration|sound)\/records$/.test(url.pathname), async (route) => {
    const body = route.request().postDataJSON() as {
      outcome: string; value: string; findings: string; requestKey: string; equipmentState: string;
    };
    const pointId = new URL(route.request().url()).pathname.split('/')[3];
    posted.push({ pointId, ...body });
    await route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          record: { id: 'inspection-' + pointId, result: pointId === 'vibration' ? 'fail' : body.outcome },
          workOrder: pointId === 'vibration' ? { id: 'wo-draft', woNumber: 'WO-UAT-CORR-01', status: 'draft' } : null,
        },
      }),
    });
  });

  await page.goto('/#/pm-schedules');
  await expect(page.getByRole('heading', { name: 'PM Planning', exact: true })).toBeVisible({ timeout: 25_000 });
  const worksheet = page.getByTestId('pm-inspection-worksheet');
  await worksheet.getByRole('combobox', { name: 'All machines' }).click();
  await expect(page.getByText('Mercerizer C314 UAT [C314-UAT]', { exact: true })).toBeVisible();
  await page.getByText('Mercerizer C314 UAT [C314-UAT]', { exact: true }).click();

  await worksheet.getByRole('button', { name: 'Generate Machine Checklist' }).click();
  const checklist = page.getByTestId('pm-machine-checklist');
  await expect(checklist).toContainText('Machine Inspection Checklist — Running', { timeout: 20_000 });
  await expect(checklist.getByTestId('pm-machine-checklist-part')).toHaveCount(2);
  await expect(checklist.getByTestId('pm-machine-checklist-row')).toHaveCount(2);
  await expect(checklist).toContainText('C314-21-02');
  await expect(checklist).toContainText('General machine checks — part assignment required');

  const soundObservation = checklist.getByRole('textbox', { name: 'Observed condition: Unusual noise' });
  await checklist.getByRole('button', { name: 'Save reading' }).last().click();
  await expect(checklist.getByRole('alert')).toContainText('Describe what you actually observed');
  expect(posted).toHaveLength(0);

  await checklist.getByRole('spinbutton', { name: 'Actual reading: Vibration' }).fill('7.9');
  await expect(checklist).toContainText('Outside configured limits');
  await checklist.getByRole('textbox', { name: 'Inspection remarks: Vibration' }).fill('High vibration at the drive bearing');
  await soundObservation.fill('Regular pulley sound, no rubbing or rattling');

  await checklist.getByRole('button', { name: 'Save Entered Readings (2)' }).click();
  await expect(checklist).toContainText('2 entries saved', { timeout: 25_000 });
  expect(posted).toHaveLength(2);
  expect(posted.map((p) => p.pointId).sort()).toEqual(['sound', 'vibration']);
  expect(posted.find((p) => p.pointId === 'vibration')?.value).toBe('7.9');
  expect(posted.find((p) => p.pointId === 'sound')?.findings).toContain('Regular pulley sound');
  expect(posted.every((p) => p.requestKey.length >= 8)).toBe(true);
  expect(posted.every((p) => p.equipmentState === 'running')).toBe(true);
  await expect(checklist).toContainText('Corrective WO-UAT-CORR-01');
  const printView = page.getByTestId('pm-machine-inspection-print');
  await expect(page.getByRole('button', { name: 'Print saved machine inspection checklist' })).toBeEnabled();
  await expect(printView).toContainText('7.9 mm/s', { timeout: 15_000 });
  await expect(printView).toContainText('Regular pulley sound, no rubbing or rattling');
  await expect(printView).toContainText('WO-UAT-CORR-01 (draft)');
  await expect(printView.getByTestId('pm-machine-print-table').locator('tbody tr')).toHaveCount(3);
  await page.emulateMedia({ media: 'print' });
  await expect(printView).toBeVisible();
  await expect(printView).toContainText('Machine Inspection List — running');
  await page.emulateMedia({ media: 'screen' });
  await expect(printView).toBeHidden();

  // The technician can match electronic entry to the task-first paper worksheet.
  await checklist.getByRole('button', { name: 'By Task (Paper Order)' }).click();
  await expect(checklist.getByTestId('pm-machine-task-heading')).toHaveCount(2);
  await expect(checklist.getByTestId('pm-machine-checklist-row')).toHaveCount(2);
  await expect(checklist.getByTestId('pm-machine-task-heading').first()).toContainText('Task #8');
  await checklist.getByRole('button', { name: 'By Part' }).click();
  await expect(checklist.getByTestId('pm-machine-task-heading')).toHaveCount(0);

  // A blank field sheet contains EMPTY handwriting cells, not the last saved
  // 7.9 mm/s reading or a fabricated Good/Bad result.
  await page.evaluate(() => { window.print = () => undefined; });
  await checklist.getByRole('button', { name: 'Print blank field inspection worksheet' }).click();
  await expect(printView).toContainText('BLANK FIELD INSPECTION SHEET');
  await expect(printView.getByTestId('pm-paper-task')).toHaveCount(3);
  await expect(printView.getByTestId('pm-paper-field-row')).toHaveCount(3);
  await expect(printView).toContainText('Drive Assembly');
  await expect(printView).toContainText('C314-21-02');
  await expect(printView).toContainText('Actual reading');
  await expect(printView).not.toContainText('7.9 mm/s');
  await expect(printView.getByLabel('Blank space for handwritten actual reading')).toHaveCount(2);
  await page.emulateMedia({ media: 'print' });
  await expect(printView).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await expect(printView).toBeHidden();

  // A state change regenerates the task list; the previous readings are not
  // silently submitted again under the standstill inspection context.
  await worksheet.getByText('Machine state', { exact: true }).locator('..').getByRole('combobox').click();
  await page.getByRole('option', { name: 'Standstill', exact: true }).click();
  await expect(page.getByTestId('pm-machine-checklist')).toContainText('Machine Inspection Checklist — Standstill');
  await expect(page.getByTestId('pm-machine-checklist').getByTestId('pm-machine-checklist-row')).toHaveCount(0);
  expect(posted).toHaveLength(2);
  const width = await checklist.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(width, 'machine checklist must not overflow the 390px viewport').toBeLessThanOrEqual(2);
});
