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
      'Interval',
      'PM Type',
      'Activity Mode',
      'Inspection Type',
      'Est. Minutes',
      'Lead Days',
      'Next Due Date',
    ]) expect(rowSource).toContain(label);
    expect(rowSource).not.toContain('Value or Interval');
    expect(rowSource).toContain('Running');
    expect(rowSource).toContain('Standstill');
    expect(rowSource).toContain('TBM');
    expect(rowSource).toContain('UBM');
    expect(rowSource).toContain('CBM');
    expect(rowSource).toContain('FBM');
    expect(plannerSource).toContain('Total estimated time');
  });

  it('uses a wider desktop assignment modal so dense planning controls do not collide', () => {
    expect(formSource).toContain('desktopMaxWidth="sm:max-w-[94vw] 2xl:max-w-[88rem]"');
  });

  it('uses proportioned responsive tracks so short numeric fields yield space to PM type and the due date', () => {
    expect(rowSource).toContain('grid-cols-12 gap-2 md:grid-cols-12 lg:grid-cols-4 xl:grid-cols-[1.15fr_1.1fr_.55fr_1.45fr_1.15fr_1.1fr_.75fr_.65fr_1.8fr]');
    expect(rowSource).toContain("const intervalField = `${compactField} col-span-2 md:col-span-4 lg:col-span-1 xl:col-span-1`");
    expect(rowSource).toContain("const estimatedMinutesField = `${compactField} col-span-5 md:col-span-4 lg:col-span-1 xl:col-span-1`");
    expect(rowSource).toContain("const leadDaysField = `${compactField} col-span-4 md:col-span-4 lg:col-span-1 xl:col-span-1`");
    expect(rowSource).toContain("const nextDueDateField = `${compactField} col-span-8 md:col-span-4 lg:col-span-2 xl:col-span-1`");
  });

  it('uses one professional control height for both native inputs and select triggers', () => {
    expect(rowSource).toContain("const compactControl = 'h-9 w-full min-w-0 px-2 text-xs'");
  });

  it('renders Ghana-style due dates while keeping the native picker as the interactive surface', () => {
    expect(rowSource).toContain("import { displayDate } from '@/components/ui/datetime-picker'");
    expect(rowSource).toContain('displayDate(task.nextDueDate)');
    expect(rowSource).toContain("lang=\"en-GB\"");
    expect(rowSource).toContain('opacity-0');
    expect(rowSource).toContain("'dd/mm/yyyy'");
  });

  it('opens the native due-date picker when the date field itself is clicked', () => {
    expect(rowSource).toContain('showPicker');
    expect(rowSource).toContain('cursor-pointer');
  });

  it('repeats the live total estimated time beside the final create action', () => {
    expect(formSource).toContain('totalPmAssignmentEstimatedMinutes');
    expect(formSource).toContain('formatPmAssignmentEstimatedTime');
    expect(formSource).toContain('Total estimated time');
  });

  it('requires an explicit PM target before task authoring, including deliberate whole-machine selection', () => {
    expect(formSource).toContain('targetConfirmed');
    expect(formSource).toContain('Select a PM target');
    expect(formSource).toContain('targetConfirmed={targetConfirmed}');
    expect(plannerSource).toContain('targetConfirmed');
    expect(plannerSource).toContain('disabled={disabled || !assetId || !targetConfirmed}');
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
