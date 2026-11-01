import { describe, expect, it } from 'vitest';
import {
  filterPmAssignmentTargets,
  groupPmAssignmentTargets,
  type PmAssignmentTargetListRecord,
} from '@/lib/pm-assignment-target-list';

const base = (overrides: Partial<PmAssignmentTargetListRecord> = {}): PmAssignmentTargetListRecord => ({
  id: 'a1', assetId: 'asset-1', componentId: 'part-1', isActive: true,
  pmType: 'tbm', activityMode: 'inspection', equipmentState: 'standstill',
  frequencyInterval: 1, frequencyUnit: 'months', nextDueDate: '2026-11-05T00:00:00.000Z',
  nextDueReading: null, estimatedMinutes: 20, leadDays: 2,
  conditionSourceType: null, conditionSourceId: null, conditionMetric: null,
  conditionOperator: null, conditionThreshold: null, conditionThresholdMax: null,
  conditionUnit: null, evaluationCadenceMinutes: null,
  asset: { id: 'asset-1', name: 'Crusher 1', assetTag: 'CR-01' },
  component: { id: 'part-1', name: 'Drive Bearing', componentCode: 'BRG-01', componentType: 'bearing' },
  assetMeter: null,
  pmTask: { id: 'task-1', taskNumber: 12, description: 'Inspect drive bearing', taskType: 'mechanical' },
  ...overrides,
});

describe('PM assignment target list projection', () => {
  it('groups all active assignments for the same part into one target without deduplicating repeated tasks', () => {
    const groups = groupPmAssignmentTargets([
      base(),
      base({ id: 'a2', pmTask: { id: 'task-1', taskNumber: 12, description: 'Inspect drive bearing', taskType: 'mechanical' }, frequencyInterval: 2 }),
      base({ id: 'a3', componentId: 'part-2', component: { id: 'part-2', name: 'Drive Belt', componentCode: 'BLT-01', componentType: 'belt' } }),
    ]);
    expect(groups).toHaveLength(2);
    const bearing = groups.find((group) => group.componentId === 'part-1');
    expect(bearing?.assignments.map((assignment) => assignment.id)).toEqual(['a1', 'a2']);
    expect(bearing?.taskCount).toBe(2);
    expect(bearing?.targetName).toBe('Drive Bearing');
  });

  it('keeps whole-machine PM separate from component PM on the same asset', () => {
    const groups = groupPmAssignmentTargets([
      base({ id: 'whole', componentId: null, component: null }),
      base({ id: 'part' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.componentId === null)?.targetName).toBe('Crusher 1');
  });

  it('can filter whole-machine targets separately from component targets', () => {
    const groups = groupPmAssignmentTargets([base({ id: 'whole-filter', componentId: null, component: null }), base({ id: 'part-filter' })]);
    const filtered = filterPmAssignmentTargets(groups, { componentId: '__machine__' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].componentId).toBeNull();
  });

  it('filters a target when one task matches but retains all target tasks for View', () => {
    const groups = groupPmAssignmentTargets([
      base({ id: 'tbm' }),
      base({ id: 'ubm', pmType: 'ubm', activityMode: 'lubrication', equipmentState: 'running', assetMeter: { id: 'm1', name: 'Run Hours', unit: 'h', currentValue: 120 }, nextDueReading: 150, nextDueDate: null }),
    ]);
    const filtered = filterPmAssignmentTargets(groups, { pmType: 'ubm' }, new Date('2026-10-31T00:00:00Z'));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].assignments).toHaveLength(2);
  });

  it('derives time, meter and event frequency filters independently from PM type labels', () => {
    const groups = groupPmAssignmentTargets([
      base({ id: 'tbm' }),
      base({ id: 'ubm', pmType: 'ubm', assetMeter: { id: 'm1', name: 'Hours', unit: 'h', currentValue: 10 }, nextDueReading: 20, nextDueDate: null }),
      base({ id: 'cbm', pmType: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null }),
    ]);
    expect(filterPmAssignmentTargets(groups, { frequencyType: 'time_day' }).length).toBe(1);
    expect(filterPmAssignmentTargets(groups, { frequencyType: 'meter' }).length).toBe(1);
    expect(filterPmAssignmentTargets(groups, { frequencyType: 'event' }).length).toBe(1);
  });

  it('classifies overdue, due-soon, meter-driven and event-driven targets', () => {
    const now = new Date('2026-10-31T00:00:00Z');
    const groups = groupPmAssignmentTargets([
      base({ id: 'overdue', componentId: 'p-over', component: { id: 'p-over', name: 'Overdue Part', componentCode: 'P1', componentType: 'part' }, nextDueDate: '2026-10-30T00:00:00Z' }),
      base({ id: 'soon', componentId: 'p-soon', component: { id: 'p-soon', name: 'Soon Part', componentCode: 'P2', componentType: 'part' }, nextDueDate: '2026-11-03T00:00:00Z' }),
      base({ id: 'meter', componentId: 'p-meter', component: { id: 'p-meter', name: 'Meter Part', componentCode: 'P3', componentType: 'part' }, pmType: 'ubm', nextDueDate: null, nextDueReading: 200, assetMeter: { id: 'm2', name: 'Hours', unit: 'h', currentValue: 150 } }),
      base({ id: 'event', componentId: 'p-event', component: { id: 'p-event', name: 'Event Part', componentCode: 'P4', componentType: 'part' }, pmType: 'cbm', nextDueDate: null, frequencyInterval: null, frequencyUnit: null }),
    ]);
    expect(filterPmAssignmentTargets(groups, { dueState: 'overdue' }, now).map((g) => g.targetName)).toEqual(['Overdue Part']);
    expect(filterPmAssignmentTargets(groups, { dueState: 'due_soon' }, now).map((g) => g.targetName)).toEqual(['Soon Part']);
    expect(filterPmAssignmentTargets(groups, { dueState: 'meter' }, now).map((g) => g.targetName)).toEqual(['Meter Part']);
    expect(filterPmAssignmentTargets(groups, { dueState: 'event' }, now).map((g) => g.targetName)).toEqual(['Event Part']);
  });
});
