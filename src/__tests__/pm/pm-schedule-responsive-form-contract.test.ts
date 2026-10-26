import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
  'utf8',
);
const planner = fs.readFileSync(
  path.join(process.cwd(), 'src/components/modules/pm/PmScheduleTaskPlanner.tsx'),
  'utf8',
);

describe('PM schedule responsive form contract', () => {
  it('uses a compact responsive grid instead of full-width stacked desktop fields', () => {
    expect(source).toContain('data-testid="pm-schedule-form-grid"');
    expect(source).toContain('grid gap-3 py-1 md:grid-cols-2 xl:grid-cols-12');
    expect(source).toContain('data-testid="pm-schedule-identity-row"');
    expect(source).toContain('data-testid="pm-schedule-source-row"');
    expect(source).toContain('lg:grid-cols-2 xl:col-span-12');
    expect(source).toContain('<PmScheduleTaskPlanner');
  });

  it('keeps task-level planning primary and confines header recurrence to legacy compatibility mode', () => {
    expect(source).not.toContain('data-testid="pm-schedule-recurrence-grid"');
    expect(source).toContain('data-testid="pm-schedule-legacy-recurrence-grid"');
    expect(source).toContain('grid gap-2 sm:grid-cols-2 xl:grid-cols-7');
    expect(source).toContain('Legacy header cadence');
    expect(source).toContain('<PmScheduleTaskPlanner');
    expect(planner).toContain('Tasks & Planning');
  });

  it('uses full-width mobile actions that return to compact buttons on larger screens', () => {
    expect(source).toContain('flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end');
    expect(source).toContain('className="w-full sm:w-auto"');
    expect(source).toContain('className="w-full bg-emerald-600 hover:bg-emerald-700 text-white sm:w-auto"');
  });
});
