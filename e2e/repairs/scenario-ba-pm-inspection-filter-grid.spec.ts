import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { getToken, lookupPlantId } from './helpers/api';

/** Regression for eight overlapping inspection filters in the PM worksheet. */
test('PM inspection filters remain readable without overlap at three viewports', async ({ page, context }) => {
  const isolatedCI = process.env.CI === 'true' && (process.env.DATABASE_URL || '').includes('repairs_uat') &&
    /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000');
  test.skip(!isolatedCI && process.env.RUN_LIVE_PM_FILTER_UAT !== '1', 'Requires isolated Repairs CI or explicit live UAT');
  test.setTimeout(100_000);
  const token = await getToken('planner');
  const plant = await lookupPlantId(token, isolatedCI ? 'PLANT-A' : 'TEMA-UAT-01');
  await authenticateAs(context, 'planner');

  for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate((plantId) => localStorage.setItem('user_plant_id', plantId), plant);
    await page.goto('/#/pm-inspections');

    const filterGrid = page.getByTestId('pm-readings-filter-grid');
    await expect(filterGrid).toBeVisible({ timeout: 25_000 });
    const fields = filterGrid.locator(':scope > div');
    await expect(fields).toHaveCount(4);
    const rects = await fields.evaluateAll((nodes) => nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, right: r.right, bottom: r.bottom };
    }));
    for (let i = 0; i < rects.length; i++) {
      expect(rects[i].width).toBeGreaterThan(60);
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap = a.x < b.right - 1 && a.right > b.x + 1 &&
          a.y < b.bottom - 1 && a.bottom > b.y + 1;
        expect(overlap, 'PM filters should not overlap').toBe(false);
      }
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, 'PM inspection page should not overflow').toBeLessThanOrEqual(3);

  }
});
