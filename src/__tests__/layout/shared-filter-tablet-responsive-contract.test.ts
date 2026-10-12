import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/responsive-overrides.css'), 'utf8');
const tabletMedia = '@media (min-width: 640px) and (max-width: 1023px)';
const narrowPhoneMedia = '@media (max-width: 419px)';
const tabletStart = css.indexOf(tabletMedia);
const tabletEnd = css.indexOf(narrowPhoneMedia, tabletStart);
const tabletCss = tabletStart >= 0 && tabletEnd > tabletStart ? css.slice(tabletStart, tabletEnd) : '';

describe('shared filter tablet responsive contract', () => {
  it('keeps filter rows in a bounded two-column grid through tablet widths', () => {
    expect(tabletStart).toBeGreaterThanOrEqual(0);
    expect(tabletEnd).toBeGreaterThan(tabletStart);
    expect(tabletCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(tabletCss).toContain('.filter-row > :first-child');
    expect(tabletCss).toContain('grid-column: 1 / -1');
  });

  it('prevents fixed-width filter children from forcing tablet overflow', () => {
    expect(tabletCss).toContain('width: 100% !important');
    expect(tabletCss).toContain('min-width: 0 !important');
    expect(tabletCss).toContain('max-width: none !important');
    expect(tabletCss).toContain('flex: none !important');
  });
});
