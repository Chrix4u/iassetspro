import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src/components/modules/TechnicianWorkOrderV11Panels.tsx'),
  'utf8',
);

describe('TechnicianWorkOrderV11Panels responsive resource layout', () => {
  it('keeps resource cards full width so desktop request rows have usable space', () => {
    expect(source).toContain(
      '<section id="resources" className="scroll-mt-28 grid grid-cols-1 gap-5">',
    );
  });

  it('uses a two-column mobile/tablet layout and horizontal desktop material row', () => {
    expect(source).toContain(
      'grid grid-cols-2 lg:grid-cols-[minmax(12rem,2fr)_minmax(5.5rem,.7fr)_minmax(6rem,.8fr)_minmax(7rem,.9fr)_minmax(12rem,1.6fr)_auto]',
    );
    expect(source).toContain('col-span-2 lg:col-span-1');
    expect(source).toContain('Request Material');
  });

  it('uses a two-column mobile/tablet layout and horizontal desktop tool row', () => {
    expect(source).toContain(
      'grid grid-cols-2 lg:grid-cols-[minmax(13rem,2fr)_minmax(5.5rem,.65fr)_minmax(7rem,.85fr)_minmax(13rem,1.7fr)_auto]',
    );
    expect(source).toContain('Request Tool');
    expect(source).not.toContain('2xl:grid-cols-[minmax(13rem,2fr)');
  });

  it('prevents grid children from forcing horizontal page overflow', () => {
    expect(source).toContain('min-w-0');
    expect(source).toContain('lg:w-auto whitespace-nowrap');
  });
});
