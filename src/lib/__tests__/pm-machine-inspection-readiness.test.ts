import { describe, expect, it } from 'vitest';
import { assessMachineInspectionReadiness } from '@/lib/pm-machine-inspection-readiness';
import type { MachineChecklistGroup, MachineChecklistTask, MachineChecklistPoint } from '@/lib/pm-machine-checklist';

const part = { id: 'part-a', name: 'Drive bearing', componentCode: 'M-21', componentType: 'part' };
const assignment: MachineChecklistTask = {
  id: 'task-1', componentId: part.id, component: part,
  pmTask: { id: 'pm-1', taskNumber: 19, description: 'Check bearing', taskType: 'inspect' },
  pmType: 'tbm', basis: 'calendar', nextDueDate: null, nextDueReading: null, equipmentState: 'running',
};
const reading = (overrides: Partial<MachineChecklistPoint> = {}): MachineChecklistPoint => ({
  id: 'check-1', componentId: part.id, name: 'Vibration', description: null,
  inspectionType: 'measurement', parameterKey: 'vibration',
  normalRange: '{"min":0,"max":4.5,"unit":"mm/s"}', frequency: 'weekly',
  nextInspection: null, dueState: 'unscheduled', latestRecord: null,
  openCorrectiveWorkOrder: null, ...overrides,
});
const groups = (points: MachineChecklistPoint[]): MachineChecklistGroup[] => [
  { component: part, tasks: [assignment], points },
];

describe('machine inspection readiness diagnostics', () => {
  it('counts valid quantitative or sight checks as recordable without inventing limits', () => {
    const result = assessMachineInspectionReadiness(groups([
      reading(),
      reading({ id: 'sight', inspectionType: 'visual', parameterKey: null, normalRange: null }),
    ]), []);
    expect(result).toMatchObject({ readyPoints: 2, blockers: 0, warnings: 0 });
    expect(result.issues).toEqual([]);
  });

  it('distinguishes missing part/check, invalid method and missing parameter', () => {
    const missingPart = { ...assignment, id: 'whole-machine', componentId: null, component: null };
    const result = assessMachineInspectionReadiness([
      ...groups([]),
      { component: { ...part, id: 'part-b', componentCode: 'M-22' }, tasks: [assignment],
        points: [reading({ id: 'legacy', inspectionType: 'functional' }),
          reading({ id: 'temp', parameterKey: null })] },
    ], [missingPart]);
    expect(result).toMatchObject({ readyPoints: 0, blockers: 4, warnings: 0 });
    expect(result.issues.map((issue) => issue.kind)).toEqual([
      'assign_part', 'add_check', 'unsupported_method', 'missing_parameter',
    ]);
  });

  it('allows a recorded measurement with missing thresholds but labels it a warning', () => {
    const result = assessMachineInspectionReadiness(groups([
      reading({ normalRange: null }),
      reading({ id: 'sight', inspectionType: 'visual', parameterKey: null, normalRange: null }),
    ]), []);
    expect(result).toMatchObject({ readyPoints: 2, blockers: 0, warnings: 1 });
    expect(result.issues[0]).toMatchObject({ kind: 'missing_limits', severity: 'warning', pointId: 'check-1' });
  });
});
