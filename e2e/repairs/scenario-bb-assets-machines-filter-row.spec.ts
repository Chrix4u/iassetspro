import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';

/**
 * Browser regression for the Assets & Machines filter bar.
 * Live UAT is opt-in because it requires a configured UAT planner account;
 * this test does not write any assets or maintenance records.
 */
test('Assets & Machines: five filters in one desktop row without overlap or page overflow', async ({ page, context }) => {
  test.skip(process.env.RUN_LIVE_ASSET_FILTER_UAT !== '1', 'Requires configured UAT planner');
  test.setTimeout(120_000);
  await authenticateAs(context, 'planner');

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1100, height: 850 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/assets-machines');
    await expect(page.getByRole('heading', { name: 'Asset Register' })).toBeVisible({ timeout: 30_000 });

    const bar = page.getByTestId('assets-machines-filters');
    const scrollRegion = page.getByTestId('assets-machines-filter-scroll');
    await expect(bar).toBeVisible();
    const selectors = [
      'assets-machines-filter-search',
      'assets-machines-filter-status',
      'assets-machines-filter-health',
      'assets-machines-filter-criticality',
      'assets-machines-filter-subcomponents',
    ];
    const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const selector of selectors) {
      const field = bar.getByTestId(selector);
      await expect(field).toBeVisible();
      const box = await field.boundingBox();
      expect(box, selector).not.toBeNull();
      boxes.push(box!);
    }

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const overlap = a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1
          && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
        expect(overlap, `${selectors[i]} and ${selectors[j]} must not overlap`).toBe(false);
      }
    }

    if (viewport.width >= 1024) {
      expect(new Set(boxes.map(b => Math.round(b.y))).size, 'all five desktop filters must share one row').toBe(1);
    } else {
      expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'page must not overflow horizontally').toBeLessThanOrEqual(3);
    if (viewport.width >= 1024) {
      const region = await scrollRegion.evaluate((node) => ({
        overflowX: getComputedStyle(node).overflowX,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }));
      expect(region.overflowX).toBe('auto');
    }
    console.log('ASSET_FILTERS_ROW_UAT', JSON.stringify({ width: viewport.width, boxes, overflow }));
  }
});
