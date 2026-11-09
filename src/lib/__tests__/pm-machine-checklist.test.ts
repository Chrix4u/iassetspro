import { describe, expect, it } from 'vitest';
import {
  groupMachineInspectionChecklist,
  machineChecklistOutOfRange,
  validateMachineChecklistEntry,
  type MachineChecklistTask,
  type MachineChecklistPoint,
  type MachineChecklistDraft,
} from '@/lib/pm-machine-checklist';

const part = { id: 'part-a', name: 'Bearing assembly', componentCode: 'C314-21-02', componentType: 'part' };
const task = (id: string, partId: string | null = 'part-a'): MachineChecklistTask => ({
  id,
  componentId: partId,
  component: partId ? part : null,
  pmTask: { id: 'pm-' + id, taskNumber: Number(id.replace(/\D/g, '')) || 1, description: 'Check bearing state', taskType: 'inspect' },
  pmType: 'tbm',
  basis: 'calendar',
  nextDueDate: '2026-11-09T00:00:00Z',
  nextDueReading: null,
  equipmentState: 'running',
});
const point = (id: string, componentId = 'part-a', method = 'measurement'): MachineChecklistPoint => ({
  id, componentId, name: id, description: null, inspectionType: method,
  parameterKey: method === 'measurement' ? 'vibration' : null,
  normalRange: method === 'measurement' ? JSON.stringify({ min: 0, max: 4.5, unit: 'mm/s' }) : null,
  frequency: 'weekly', nextInspection: '2026-11-09T00:00:00Z',
  dueState: 'due_today', latestRecord: null, openCorrectiveWorkOrder: null,
});
const draft = (partial: Partial<MachineChecklistDraft> = {}): MachineChecklistDraft => ({
  value: '', outcome: 'pass', findings: '', recommendation: '', requestKey: '', ...partial,
});

describe('full-machine running / standstill PM checklist', () => {
  it('groups tasks by registered part and shows each configured reading ONCE', () => {
    const result = groupMachineInspectionChecklist([task('task-2'), task('task-1')], [
      point('vibration'), point('temperature'), point('temperature'),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].component.componentCode).toBe('C314-21-02');
    expect(result.groups[0].tasks.map((row) => row.pmTask.taskNumber)).toEqual([1, 2]);
    expect(result.groups[0].points.map((row) => row.id)).toEqual(['temperature', 'vibration']);
    expect(result.unconfiguredTasks).toBe(0);
  });

  it('never invents a part or method for machine-wide or unconfigured tasks', () => {
    const result = groupMachineInspectionChecklist([task('task-1', null), task('task-2')], []);
    expect(result.generalTasks).toHaveLength(1);
    expect(result.generalTasks[0].component).toBeNull();
    expect(result.groups[0].points).toHaveLength(0);
    expect(result.unconfiguredTasks).toBe(2);
  });

  it('does not attach unrelated machine-part readings to a task', () => {
    const result = groupMachineInspectionChecklist([task('task-1')], [point('other', 'part-b')]);
    expect(result.groups[0].points).toHaveLength(0);
    expect(result.unconfiguredTasks).toBe(1);
  });

  it('requires a real numeric reading for instrument inspection', () => {
    expect(validateMachineChecklistEntry(point('vib'), draft())).toMatch(/numeric/i);
    expect(validateMachineChecklistEntry(point('vib'), draft({ value: 'abc' }))).toMatch(/numeric/i);
    expect(validateMachineChecklistEntry(point('vib'), draft({ value: '3.2' }))).toBeNull();
    expect(validateMachineChecklistEntry(point('vib'), draft({ value: '-1.5' }))).toBeNull();
  });

  it('requires the actual observed condition even for a good sight inspection', () => {
    const visual = point('sound', 'part-a', 'visual');
    expect(validateMachineChecklistEntry(visual, draft())).toMatch(/observed/i);
    expect(validateMachineChecklistEntry(visual, draft({ findings: 'Motor sound steady and no visible leaks.' }))).toBeNull();
    expect(validateMachineChecklistEntry(visual, draft({ outcome: 'needs_attention' }))).toMatch(/observed/i);
    expect(validateMachineChecklistEntry(visual, draft({ findings: 'Rattling sound', outcome: 'fail' }))).toBeNull();
  });

  it('does not save an abnormal technician assessment without findings', () => {
    expect(validateMachineChecklistEntry(point('temp'), draft({ value: '8', outcome: 'fail' }))).toMatch(/defect/i);
    expect(validateMachineChecklistEntry(point('temp'), draft({ value: '8', outcome: 'fail', findings: 'Abnormal noise' }))).toBeNull();
  });

  it('previews violations of configured instrument limits but leaves the server authoritative', () => {
    const vibration = point('vibration');
    expect(machineChecklistOutOfRange(vibration, '4.6')).toBe(true);
    expect(machineChecklistOutOfRange(vibration, '0')).toBe(false);
    expect(machineChecklistOutOfRange(vibration, '4.5')).toBe(false);
    expect(machineChecklistOutOfRange(vibration, '-0.1')).toBe(true);
    expect(machineChecklistOutOfRange(vibration, '')).toBe(false);
    expect(machineChecklistOutOfRange(vibration, 'n/a')).toBe(false);
  });

  it('refuses unsupported legacy method instead of claiming to capture it', () => {
    expect(validateMachineChecklistEntry(point('legacy', 'part-a', 'functional'), draft({ findings: 'Checked' }))).toMatch(/configure/i);
  });
});
