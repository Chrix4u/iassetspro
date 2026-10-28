import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  try { return readFileSync(resolve(process.cwd(), path), 'utf8'); } catch { return ''; }
}

const formSource = source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
const plannerSource = source('src/components/modules/pm/PmAssignmentTaskPlanner.tsx');
const rowSource = source('src/components/modules/pm/PmAssignmentTaskCard.tsx');
const targetSource = source('src/components/modules/pm/PmTargetTreePicker.tsx');
const maintenanceSource = source('src/components/modules/MaintenancePages.tsx');

describe('direct PM assignment authoring UI contract', () => {
  it('keeps direct part-level assignments while restoring template-or-library task authoring', () => {
    expect(formSource).toContain('/api/pm-assignments');
    expect(formSource).toContain('Task Template');
    expect(formSource).toContain('PmAssignmentTaskPlanner');
    expect(plannerSource).toContain('Add Task from Library');
    expect(formSource).not.toContain('Schedule Title');
    expect(targetSource).toContain('MachineVisualExplorer');
    expect(targetSource).toContain('Whole machine');
  });

  it('uses the compact per-task planning row from yesterday with meeting vocabulary added', () => {
    for (const label of [
      'Frequency Type',
      'Frequency Unit',
      'Value',
      'PM Type',
      'Activity Mode',
      'Inspection Type',
      'Est. Minutes',
      'Lead Days',
      'Next Due Date',
    ]) expect(rowSource).toContain(label);
    expect(rowSource).toContain('Running');
    expect(rowSource).toContain('Standstill');
    expect(rowSource).toContain('TBM');
    expect(rowSource).toContain('UBM');
    expect(rowSource).toContain('CBM');
    expect(rowSource).toContain('FBM');
    expect(plannerSource).toContain('Total estimated time');
  });

  it('allows the same Task Library task to be added again as an independent row', () => {
    expect(plannerSource).toContain('excludedTaskIds={[]}');
    expect(plannerSource).toMatch(/clientId/);
    expect(plannerSource).not.toContain('Already scheduled');
  });

  it('uses first-class asset meters only as selectable UBM sources and does not manage meters inline', () => {
    expect(plannerSource).toContain('/api/assets/');
    expect(plannerSource).toContain('/meters');
    expect(rowSource).toContain('assetMeterId');
    expect(rowSource).toContain('Current');
    expect(rowSource).toContain('meter.unit');
    expect(formSource).not.toContain('AssetMetersPanel');
    expect(formSource).not.toContain('Meter Action');
    expect(formSource).not.toContain('Add Meter');
    expect(formSource).not.toContain('Manage Meter');
  });

  it('puts target selection before full-width Location Path and Technical Path rows', () => {
    const choose = targetSource.indexOf('Choose PM Target');
    const location = targetSource.indexOf('Location Path');
    const technical = targetSource.indexOf('Technical Path');
    expect(choose).toBeGreaterThan(-1);
    expect(location).toBeGreaterThan(choose);
    expect(technical).toBeGreaterThan(location);
    expect(targetSource).toContain('space-y-');
  });

  it('keeps direct assignments primary while retaining legacy PM schedule history', () => {
    expect(maintenanceSource).toContain('PmAssignmentFormDialog');
    expect(maintenanceSource).toContain('New PM Assignment');
    expect(maintenanceSource).toContain('Legacy PM Schedules');
  });
});
