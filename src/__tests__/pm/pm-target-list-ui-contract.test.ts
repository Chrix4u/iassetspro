import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('PM target-centered planning UI', () => {
  it('replaces the legacy PM schedule surface with the target-centered planning page', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    expect(maintenance).toContain('PmPlanningPage');
    expect(maintenance).not.toContain('Legacy PM Schedules');
    expect(maintenance).not.toContain('Direct PM Assignments');
  });

  it('shows one target list with the requested asset and PM condition filters', () => {
    const file = resolve(process.cwd(), 'src/components/modules/pm/PmAssignmentTargetList.tsx');
    expect(existsSync(file)).toBe(true);
    if (!existsSync(file)) return;
    const source = readFileSync(file, 'utf8');
    for (const label of ['Asset', 'Part / Target', 'PM Type', 'Activity Mode', 'Inspection Type', 'Frequency Type', 'Due State']) {
      expect(source).toContain(label);
    }
    expect(source).toContain('View');
    expect(source).toContain('Edit');
    expect(source).toContain('Delete');
  });

  it('opens full task conditions in View instead of expanding the list row', () => {
    const file = resolve(process.cwd(), 'src/components/modules/pm/PmAssignmentTargetDetailDialog.tsx');
    expect(existsSync(file)).toBe(true);
    if (!existsSync(file)) return;
    const source = readFileSync(file, 'utf8');
    for (const detail of ['PM Type', 'Activity Mode', 'Inspection Type', 'Frequency Type', 'Interval', 'Estimated Minutes', 'Lead Days', 'Condition Source', 'Threshold']) {
      expect(source).toContain(detail);
    }
  });

  it('reuses the assignment editor in fixed-target edit mode and saves atomically', () => {
    const source = read('src/components/modules/pm/PmAssignmentFormDialog.tsx');
    expect(source).toContain('editTarget');
    expect(source).toContain("api.patch('/api/pm-assignments/target'");
    expect(source).toContain('assignmentId');
    expect(source).toContain('Update PM Schedule');
  });
});
