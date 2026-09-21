import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'src/app/responsive-overrides.css'), 'utf8');
const dialog = readFileSync(join(process.cwd(), 'src/components/shared/ResponsiveDialog.tsx'), 'utf8');

describe('shared responsive foundation v2', () => {
  it('loads responsive overrides after global and page layout styles', () => {
    const globals = layout.indexOf('"./globals.css"');
    const pageLayout = layout.indexOf('"./page-layout.css"');
    const responsive = layout.indexOf('"./responsive-overrides.css"');
    expect(globals).toBeGreaterThanOrEqual(0);
    expect(pageLayout).toBeGreaterThan(globals);
    expect(responsive).toBeGreaterThan(pageLayout);
  });

  it('keeps compact filters usable across phone widths', () => {
    expect(css).toContain('@media (max-width: 639px)');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('.filter-row > :first-child');
    expect(css).toContain('@media (max-width: 419px)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('marks mobile and desktop ResponsiveDialog bodies for shared form reflow', () => {
    expect(dialog.match(/responsive-dialog-body/g)?.length).toBeGreaterThanOrEqual(2);
    expect(css).toContain('.responsive-dialog-body .grid.grid-cols-3');
    expect(css).toContain('.responsive-dialog-body .grid.grid-cols-6');
    expect(css).toContain('.responsive-dialog-body .grid > *');
    expect(css).toContain('@media (max-width: 479px)');
  });
});
