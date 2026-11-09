import { describe, expect, it } from 'vitest';
import {
  buildMachineInspectionPrintRows,
  machineInspectionPrintSummary,
  type PrintableMachineInspectionData,
} from '@/lib/pm-machine-checklist-print';
import type {
  MachineChecklistTask, MachineChecklistPoint,
} from '@/lib/pm-machine-checklist';

const component = { id: 'bearing-1', name: 'Bearing', componentCode: 'C314-21-02', componentType: 'part' };
const task: MachineChecklistTask = {
  id: 'assignment-1', componentId: component.id, component,
  pmTask: { id: 'task-1', taskNumber: 4, description: 'Measure vibration', taskType: 'measure' },
  pmType: 'tbm', basis: 'calendar', nextDueDate: null, nextDueReading: null, equipmentState: 'running',
};
const point = (patch: Partial<MachineChecklistPoint> = {}): MachineChecklistPoint => ({
  id: 'vib', componentId: component.id, name: 'Vibration', description: null,
  inspectionType: 'measurement', parameterKey: 'vibration',
  normalRange: JSON.stringify({ min: 0, max: 4.5, unit: 'mm/s' }),
  frequency: 'weekly', nextInspection: null, dueState: 'due_today',
  latestRecord: null, openCorrectiveWorkOrder: null, ...patch,
});
const data = (patch: Partial<PrintableMachineInspectionData> = {}): PrintableMachineInspectionData => ({
  machine: { id: 'asset-1', name: 'Mercerizer C314', assetTag: 'C314', plantId: 'plant-a' },
  equipmentState: 'running', generatedAt: '2026-11-09T07:00:00Z',
  totalAssignments: 1, totalConfiguredPoints: 1, unconfiguredTasks: 0,
  groups: [{ component, tasks: [task], points: [point()] }],
  generalTasks: [], ...patch,
});

describe('print machine inspection checklist — paper-style evidence snapshot', () => {
  it('never manufactures a passing reading for a configured but unrecorded point', () => {
    const rows = buildMachineInspectionPrintRows(data());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      partCode: 'C314-21-02',
      checkName: 'Vibration',
      method: 'measurement',
      actual: '',
      outcome: 'NOT RECORDED',
      correctiveWorkOrder: '',
      requiresConfiguration: false,
    });
    expect(rows[0].reference).toContain('4.5');
    expect(machineInspectionPrintSummary(rows)).toMatchObject({
      checks: 1, recorded: 0, normal: 0, abnormal: 0,
    });
  });

  it('shows the real saved instrument reading, result, remarks, time and outstanding corrective WO', () => {
    const source = point({
      latestRecord: {
        id: 'record-1', result: 'fail', value: '7.9',
        findings: 'Excess vibration and rough bearing sound',
        inspectedAt: '2026-11-09T07:15:00Z',
      },
      openCorrectiveWorkOrder: { id: 'wo-1', woNumber: 'WO-C314-001', status: 'draft' },
    });
    const rows = buildMachineInspectionPrintRows(data({
      groups: [{ component, tasks: [task], points: [source] }],
    }));
    expect(rows[0].actual).toBe('7.9 mm/s');
    expect(rows[0].outcome).toBe('FAIL');
    expect(rows[0].remarks).toContain('Excess vibration');
    expect(rows[0].recordedAt).not.toBe('');
    expect(rows[0].correctiveWorkOrder).toContain('WO-C314-001 (draft)');
    expect(machineInspectionPrintSummary(rows).abnormal).toBe(1);
  });

  it('prints exact sight observations and flags missing numeric thresholds instead of inventing limits', () => {
    const sight = point({
      id: 'sound', name: 'Sound', inspectionType: 'visual', normalRange: null, parameterKey: null,
      latestRecord: {
        id: 'record-2', result: 'pass', value: null,
        findings: 'No audible knocking or rubbing',
        inspectedAt: new Date('2026-11-09T08:00:00Z'),
      },
    });
    const noLimits = point({ id: 'temperature', name: 'Temperature', normalRange: null });
    const rows = buildMachineInspectionPrintRows(data({
      groups: [{ component, tasks: [task], points: [sight, noLimits] }],
    }));
    expect(rows[0].actual).toBe('No audible knocking or rubbing');
    expect(rows[0].outcome).toBe('PASS');
    expect(rows[1].reference).toBe('Numeric limits NOT SET');
    expect(machineInspectionPrintSummary(rows)).toMatchObject({
      checks: 2, recorded: 1, normal: 1, abnormal: 0,
    });
  });

  it('prints the saved state of each inspection, not the current report filter', () => {
    const measured = point({
      latestRecord: {
        id: 'record-standstill', result: 'pass', value: '3.8',
        findings: 'Bearing stable', inspectedAt: '2026-11-09T08:00:00Z',
        equipmentState: 'standstill',
      },
    });
    const rows = buildMachineInspectionPrintRows(data({
      equipmentState: 'running',
      groups: [{ component, tasks: [task], points: [measured] }],
    }));
    expect(rows[0].recordedState).toBe('standstill');

    const legacy = buildMachineInspectionPrintRows(data());
    expect(legacy[0].recordedState).toBe('unknown');
  });

  it('keeps unconfigured part tasks and machine-wide tasks visibly unresolved', () => {
    const unassigned: MachineChecklistTask = { ...task, id: 'whole', component: null, componentId: null };
    const rows = buildMachineInspectionPrintRows(data({
      groups: [{ component, tasks: [task], points: [] }],
      generalTasks: [unassigned],
    }));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ outcome: 'UNCONFIGURED', actual: '', requiresConfiguration: true });
    expect(rows[1]).toMatchObject({ partCode: 'UNASSIGNED', outcome: 'UNCONFIGURED' });
    expect(machineInspectionPrintSummary(rows)).toMatchObject({ checks: 0, unconfigured: 2 });
  });
});
