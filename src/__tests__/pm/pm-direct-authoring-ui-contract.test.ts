import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  try { return readFileSync(resolve(process.cwd(), path), 'utf8'); } catch { return ''; }
}

const formSource = source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
const targetSource = source('src/components/modules/pm/PmTargetTreePicker.tsx');
const maintenanceSource = source('src/components/modules/MaintenancePages.tsx');
const legacyCardSource = source('src/components/modules/pm/PmScheduleTaskCard.tsx');

describe('direct PM assignment authoring UI contract', () => {
  it('authors PM directly against an exact machine target without requiring a schedule title', () => {
    expect(formSource).toContain('/api/pm-assignments');
    expect(formSource).toContain('Task Library');
    expect(formSource).toContain('PM Target');
    expect(formSource).not.toContain('Schedule Title');
    expect(targetSource).toContain('MachineVisualExplorer');
    expect(targetSource).toContain('Whole machine');
    expect(targetSource).toContain('Location Path');
    expect(targetSource).toContain('Technical Path');
  });

  it('exposes the engineer-approved planning vocabulary and a visible calendar control', () => {
    expect(formSource).toContain('>Value</Label>');
    expect(formSource).toContain('Activity Mode');
    expect(formSource).toContain('Inspection Type');
    expect(formSource).toContain('Running');
    expect(formSource).toContain('Standstill');
    expect(formSource).toContain('Est. Minutes');
    expect(formSource).toContain("type={usesSubDayTime ? 'datetime-local' : 'date'}");
    expect(formSource).toContain('TBM');
    expect(formSource).toContain('UBM');
    expect(formSource).toContain('CBM');
    expect(formSource).toContain('FBM');
  });

  it('inherits UBM unit and current reading from the selected first-class asset meter', () => {
    expect(formSource).toContain('/meters');
    expect(formSource).toContain('assetMeterId');
    expect(formSource).toContain('Current');
    expect(formSource).toContain('meter.unit');
  });

  it('makes direct assignments the primary new-PM workflow while retaining legacy schedule history', () => {
    expect(maintenanceSource).toContain('PmAssignmentFormDialog');
    expect(maintenanceSource).toContain('New PM Assignment');
    expect(maintenanceSource).toContain('/api/pm-assignments');
    expect(maintenanceSource).toContain('Legacy PM Schedules');
  });

  it('uses the new planner wording even inside the retained legacy task card', () => {
    expect(legacyCardSource).toContain('>Value</Label>');
    expect(legacyCardSource).toContain('Standstill');
    expect(legacyCardSource).not.toContain('>Value / Interval</Label>');
  });
});
