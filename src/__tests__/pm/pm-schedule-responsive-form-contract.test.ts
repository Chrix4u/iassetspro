import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
  'utf8',
);

describe('PM schedule responsive form contract', () => {
  it('uses a compact responsive grid instead of full-width stacked desktop fields', () => {
    expect(source).toContain('data-testid="pm-schedule-form-grid"');
    expect(source).toContain('grid gap-4 py-2 md:grid-cols-2 xl:grid-cols-12');
    expect(source).toContain('md:col-span-2 xl:col-span-7');
    expect(source).toContain('md:col-span-2 xl:col-span-5');
    expect(source).toContain('md:col-span-1 xl:col-span-6');
    expect(source).toContain('md:col-span-1 xl:col-span-3');
  });

  it('keeps recurrence controls dense on desktop while collapsing cleanly on smaller screens', () => {
    expect(source).toContain('data-testid="pm-schedule-recurrence-grid"');
    expect(source).toContain('grid gap-3 sm:grid-cols-2 xl:grid-cols-6');
    expect(source).toContain('Planning & recurrence');
  });

  it('uses full-width mobile actions that return to compact buttons on larger screens', () => {
    expect(source).toContain('flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end');
    expect(source).toContain('className="w-full sm:w-auto"');
    expect(source).toContain('className="w-full bg-emerald-600 hover:bg-emerald-700 text-white sm:w-auto"');
  });
});
