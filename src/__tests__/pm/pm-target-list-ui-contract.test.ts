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

  it('shows the requested asset and PM condition filters above a machine-first accordion', () => {
    const file = resolve(process.cwd(), 'src/components/modules/pm/PmAssignmentTargetList.tsx');
    expect(existsSync(file)).toBe(true);
    if (!existsSync(file)) return;
    const source = readFileSync(file, 'utf8');
    for (const label of ['Asset', 'Part / Target', 'PM Type', 'Activity Mode', 'Inspection Type', 'Frequency Type', 'Due State']) {
      expect(source).toContain(label);
    }
    expect(source).toContain("from '@/components/ui/accordion'");
    expect(source).toContain('groupPmAssignmentAssets(filtered)');
    expect(source).toContain('data-testid="pm-machine-accordion"');
    expect(source).toContain('Parent machine');
    expect(source).toContain('machine.targets.map');
    expect(source).toContain('View');
    expect(source).toContain('Configure Triggers');
    expect(source).toContain('Edit');
    expect(source).toContain('Delete');
    expect(source).toContain('hasWholeMachineTarget');
    expect(source).toContain('value="__machine__"');
  });

  it('shows acronym-only PM Type choices in the list filters', () => {
    const source = read('src/components/modules/pm/PmAssignmentTargetList.tsx');
    expect(source).toContain('<SelectItem value="tbm">TBM</SelectItem>');
    expect(source).toContain('<SelectItem value="ubm">UBM</SelectItem>');
    expect(source).toContain('<SelectItem value="cbm">CBM</SelectItem>');
    expect(source).toContain('<SelectItem value="fbm">FBM</SelectItem>');
    expect(source).not.toContain('TBM · Time Based');
  });

  it('opens full task conditions in View instead of expanding individual target rows', () => {
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
    expect(source).toContain('Configure PM Triggers');
    expect(source).toContain('Save Trigger Changes');
  });
});
