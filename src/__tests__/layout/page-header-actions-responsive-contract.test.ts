import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/responsive-overrides.css'), 'utf8');
const phoneMedia = '@media (max-width: 639px)';
const tabletMedia = '@media (min-width: 640px) and (max-width: 1023px)';
const phoneStart = css.indexOf(phoneMedia);
const phoneEnd = css.indexOf(tabletMedia, phoneStart);
const phoneCss = phoneStart >= 0 && phoneEnd > phoneStart ? css.slice(phoneStart, phoneEnd) : '';

describe('page header mobile action responsiveness', () => {
  it('lets wrapped page-header action groups consume the mobile width', () => {
    expect(phoneStart).toBeGreaterThanOrEqual(0);
    expect(phoneEnd).toBeGreaterThan(phoneStart);
    expect(phoneCss).toContain('.page-content > .flex.items-center.justify-between.flex-wrap > .flex.gap-2');
    expect(phoneCss).toContain('width: 100%');
    expect(phoneCss).toContain('flex-wrap: wrap');
  });

  it('lets page-header actions share available space without overflowing', () => {
    expect(phoneCss).toContain('.page-content > .flex.items-center.justify-between.flex-wrap > .flex.gap-2 > *');
    expect(phoneCss).toContain('flex: 1 1 9rem');
    expect(phoneCss).toContain('min-width: 0');
  });
});
