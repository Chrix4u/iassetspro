import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { getToken, lookupPlantId } from './helpers/api';

/** Regression for eight overlapping inspection filters in the PM worksheet. */
test('PM Action List filters use three spacious controls above five without overlap', async ({ page, context }) => {
  test.skip(process.env.RUN_LIVE_PM_FILTER_UAT !== '1', 'Requires pre-existing TEMA-UAT-01 live UAT plant');
  test.setTimeout(100_000);
  const token = await getToken('planner');
  const plant = await lookupPlantId(token, 'TEMA-UAT-01');
  await authenticateAs(context, 'planner');

  for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate((plantId) => localStorage.setItem('user_plant_id', plantId), plant);
    await page.goto('/#/pm-schedules');

    const panel = page.getByTestId('pm-inspection-worksheet');
    await expect(panel).toBeVisible({ timeout: 25_000 });
    const primary = panel.getByTestId('pm-inspection-filters-primary');
    const secondary = panel.getByTestId('pm-inspection-filters-secondary');
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();
    const primaryChildren = primary.locator(':scope > div');
    const secondaryChildren = secondary.locator(':scope > div');
    await expect(primaryChildren).toHaveCount(3);
    await expect(secondaryChildren).toHaveCount(5);

    const first = await primaryChildren.evaluateAll((nodes) => nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    }));
    const second = await secondaryChildren.evaluateAll((nodes) => nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    }));

    const overlaps = (a: typeof first[number], b: typeof first[number]) =>
      a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1;

    for (const fields of [first, second]) {
      for (let i = 0; i < fields.length; i++) {
        expect(fields[i].width, 'field must have positive usable width').toBeGreaterThan(110);
        for (let j = i + 1; j < fields.length; j++) {
          expect(overlaps(fields[i], fields[j]), 'filters must not overlap').toBe(false);
        }
      }
    }
    expect(Math.max(...first.map((field) => field.bottom))).toBeLessThan(Math.min(...second.map((field) => field.y)));

    if (viewport.width === 1440) {
      expect(new Set(first.map((f) => Math.round(f.y))).size).toBe(1);
      expect(new Set(second.map((f) => Math.round(f.y))).size).toBe(1);
      expect(first[2].width, 'machine must be wider').toBeGreaterThan(first[1].width * 1.4);
      expect(second[3].width, 'outcome should be wider than method').toBeGreaterThan(second[1].width);
      expect(second[4].width, 'follow-up should be wider than due').toBeGreaterThan(second[2].width);
    }

    const viewportOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(viewportOverflow, 'page should have no horizontal overflow').toBeLessThanOrEqual(3);
    console.log('PM_FILTER_LAYOUT_PASS', JSON.stringify({ viewport: viewport.width, first, second, viewportOverflow }));
  }
});
