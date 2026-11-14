import { expect, test } from '@playwright/test';
import { authenticateAs } from './helpers/auth';

test('PM readings group one selected machine by task then parts, with useful page guide', async ({ page, context }) => {
  test.setTimeout(100_000);
  await authenticateAs(context, 'planner');
  await page.setViewportSize({ width: 390, height: 844 });

  await page.route((url) => url.pathname === '/api/assets', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [{ id: 'machine-rp01', name: 'Rotary Printing Machine RP-01', assetTag: 'RP-01' }] }),
  }));
  const seenIds: string[] = [];
  await page.route((url) => url.pathname === '/api/pm-inspections', (route) => {
    const query = new URL(route.request().url()).searchParams;
    seenIds.push(query.get('assetId') || '');
    const point = (id: string, part: string, componentCode: string, inspection: string, value: string) => ({
      id, name: inspection, description: null, inspectionType: 'measurement',
      parameterKey: inspection === 'Bearing Temperature' ? 'bearing_temperature_c' : 'bearing_vibration_mm_s',
      normalRange: inspection === 'Bearing Temperature' ? '{"min":20,"max":75,"unit":"°C"}' : '{"min":0,"max":4.5,"unit":"mm/s"}',
      frequency: 'weekly', nextInspection: '2026-11-19T00:00:00Z',
      lastInspected: '2026-11-11T10:00:00Z', dueState: 'upcoming',
      component: { id: part, name: part, componentCode, componentType: 'bearing',
        asset: { id: 'machine-rp01', name: 'Rotary Printing Machine RP-01', assetTag: 'RP-01', plantId: 'plant-01' } },
      latestRecord: { id: id + '-record', result: 'pass', value, findings: null, inspectedAt: '2026-11-11T10:00:00Z', workOrder: null },
      openCorrectiveWorkOrder: null,
    });
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [
        point('temp-drive', 'Drive-Side Spherical Roller Bearing', 'RP01-BRG-DS', 'Bearing Temperature', '54.2'),
        point('temp-non-drive', 'Non-Drive Bearing', 'RP01-BRG-NDS', 'Bearing Temperature', '51.8'),
        point('vib-drive', 'Drive-Side Spherical Roller Bearing', 'RP01-BRG-DS', 'Bearing Vibration', '2.7'),
      ], pagination: { page: 1, limit: 100, total: 3, totalPages: 1 } }),
    });
  });

  await page.goto('/#/pm-inspections');
  await expect(page.getByRole('heading', { name: 'Inspection Readings', exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId('pm-select-machine')).toBeVisible();
  expect(seenIds).toHaveLength(0);
  await page.getByRole('combobox', { name: 'Choose machine name or code' }).click();
  await page.getByText('Rotary Printing Machine RP-01 [RP-01]', { exact: true }).last().click();
  const machine = page.getByTestId('pm-inspection-machine-group');
  await expect(machine).toHaveCount(1, { timeout: 15_000 });
  expect(seenIds.every((id) => id === 'machine-rp01')).toBe(true);
  const groups = machine.getByTestId('pm-inspection-task-group');
  await expect(groups).toHaveCount(2);
  const temperature = groups.filter({ hasText: 'Bearing Temperature' });
  await expect(temperature.getByTestId('pm-inspection-point')).toHaveCount(2);
  await expect(temperature).toContainText('Drive-Side Spherical Roller Bearing');
  await expect(temperature).toContainText('Non-Drive Bearing');
  await expect(temperature).toContainText('20 to 75 °C');
  await expect(temperature).toContainText('11/11/2026');
  await expect(groups.filter({ hasText: 'Bearing Vibration' }).getByTestId('pm-inspection-point')).toHaveCount(1);
  const viewportOffsets = await page.evaluate(() => ({
    windowScrollX: window.scrollX,
    rootScrollLeft: document.documentElement.scrollLeft,
    bodyScrollLeft: document.body.scrollLeft,
    mainScrollLeft: document.querySelector('main')?.scrollLeft ?? null,
    shellScrollLeft: document.querySelector('main')?.parentElement?.scrollLeft ?? null,
    shellOverflowX: document.querySelector('main')?.parentElement ? getComputedStyle(document.querySelector('main')!.parentElement!).overflowX : null,
    rootWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    visualOffsetLeft: window.visualViewport?.offsetLeft ?? null,
    mainRect: document.querySelector('main')?.getBoundingClientRect().toJSON(),
    pageRect: document.querySelector('.pm-machine-readings')?.getBoundingClientRect().toJSON(),
    cardRect: document.querySelector('[data-testid="pm-inspection-machine-group"]')?.getBoundingClientRect().toJSON(),
  }));
  expect(viewportOffsets.shellScrollLeft, 'The application shell must not scroll horizontally').toBe(0);
  const rect = await machine.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x, 'The machine card must remain fully visible: ' + JSON.stringify(viewportOffsets)).toBeGreaterThanOrEqual(-1);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(391);

  await page.getByRole('button', { name: 'Open PM page guide' }).click();
  const guide = page.getByRole('dialog', { name: 'PM page assistant' });
  await expect(guide).toContainText('See each machine once');
  await expect(guide.getByRole('button', { name: 'Action Lists', exact: true })).toBeVisible();
  await guide.getByRole('button', { name: 'Action Lists', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Machine Action Lists' })).toBeVisible({ timeout: 20_000 });
  // Action Lists are generated by machine and operating state; no redundant
  // Generate List refresh or separate standalone Plan Inspection action.
  await expect(page.getByRole('heading', { name: 'Generate an Action List for one machine' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Action List', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate List', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Plan Inspection', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Inspection Point', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh Inspection Points', exact: true })).toHaveCount(0);
});
