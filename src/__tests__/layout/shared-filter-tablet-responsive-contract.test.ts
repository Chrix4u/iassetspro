import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/responsive-overrides.css'), 'utf8');

describe('shared filter tablet responsive contract', () => {
  it('keeps filter rows in a bounded two-column grid through tablet widths', () => {
    expect(css).toContain('@media (min-width: 640px) and (max-width: 1023px)');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('.filter-row > :first-child');
    expect(css).toContain('grid-column: 1 / -1');
  });

  it('prevents fixed-width filter children from forcing tablet overflow', () => {
    expect(css).toContain('width: 100% !important');
    expect(css).toContain('min-width: 0 !important');
    expect(css).toContain('max-width: none !important');
    expect(css).toContain('flex: none !important');
  });
});
