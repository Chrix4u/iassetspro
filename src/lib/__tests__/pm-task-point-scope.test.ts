import { describe, expect, it } from 'vitest';
import type { MachineChecklistGroup, MachineChecklistPoint, MachineChecklistTask } from '@/lib/pm-machine-checklist';
import { inspectionPointsForTask, inspectionTaskLabelsForPoint, missingInspectionTaskMappings, plannedPaperInspectionScope } from '@/lib/pm-task-point-scope';

const part = { id: 'bearing', name: 'Drive bearing', componentCode: 'C314-21-02', componentType: 'part' };
const task = (id: string): MachineChecklistTask => ({
  id: 'assignment-' + id, componentId: part.id, component: part,
  pmTask: { id, taskNumber: id === 'temperature' ? 1 : 2, description: id, taskType: 'measure' },
  pmType: 'tbm', basis: 'calendar', nextDueDate: null, nextDueReading: null, equipmentState: 'running',
});
const point = (id: string): MachineChecklistPoint => ({
  id, componentId: part.id, name: id, description: null, inspectionType: 'measurement',
  parameterKey: id, normalRange: null, frequency: 'weekly', nextInspection: null,
  dueState: 'unscheduled', latestRecord: null, openCorrectiveWorkOrder: null,
});
const group: MachineChecklistGroup = {
  component: part, tasks: [task('temperature'), task('vibration')], points: [point('t'), point('v')],
};
describe('task-scoped industrial inspection checks', () => {
  it('does not guess which point belongs to an unmapped task on a shared part', () => {
    expect(inspectionPointsForTask(group, 'temperature', [])).toMatchObject({ points: [], mappingRequired: true });
    expect(missingInspectionTaskMappings([group], [])).toEqual({
      partCount: 1, taskCount: 2, firstComponentId: 'bearing',
    });
  });
  it('shows only the exact checks assigned to each PM task', () => {
    const links = [
      { pmTaskId: 'temperature', inspectionPointId: 't' },
      { pmTaskId: 'vibration', inspectionPointId: 'v' },
      { pmTaskId: 'temperature', inspectionPointId: 'foreign-part-check' },
    ];
    expect(inspectionPointsForTask(group, 'temperature', links).points.map((p) => p.id)).toEqual(['t']);
    expect(inspectionPointsForTask(group, 'vibration', links).points.map((p) => p.id)).toEqual(['v']);
    expect(missingInspectionTaskMappings([group], links).taskCount).toBe(0);
  });
  it('labels CSV readings with exact task associations rather than every task sharing the part', () => {
    const links = [
      { pmTaskId: 'temperature', inspectionPointId: 't' },
      { pmTaskId: 'vibration', inspectionPointId: 'v' },
    ];
    expect(inspectionTaskLabelsForPoint(group, 't', links)).toEqual(['#1 temperature']);
    expect(inspectionTaskLabelsForPoint(group, 'v', links)).toEqual(['#2 vibration']);
    expect(inspectionTaskLabelsForPoint(group, 't', [])).toEqual([]);
    expect(inspectionTaskLabelsForPoint(group, 'foreign-point', links)).toEqual([]);
    expect(inspectionTaskLabelsForPoint(group, 't', [
      ...links, { pmTaskId: 'vibration', inspectionPointId: 't' },
    ])).toEqual(['#1 temperature', '#2 vibration']);
    const duplicateAssignment = { ...group, tasks: [task('temperature'), task('temperature')] };
    expect(inspectionTaskLabelsForPoint(duplicateAssignment, 't', [])).toEqual(['#1 temperature']);
  });
  it('keeps a one-task part backward compatible without guessed many-to-many links', () => {
    const single = { ...group, tasks: [task('temperature')] };
    expect(inspectionPointsForTask(single, 'temperature', []).points.map((p) => p.id)).toEqual(['t', 'v']);
    expect(inspectionPointsForTask(single, 'temperature', [{ pmTaskId: 'temperature', inspectionPointId: 't' }])
      .points.map((p) => p.id)).toEqual(['t']);
  });
  it('server paper scope rejects missing shared-part assignments and deduplicates recorded point IDs', () => {
    const assignments = [{ pmTaskId: 'temperature', componentId: 'bearing' }, { pmTaskId: 'vibration', componentId: 'bearing' }];
    const points = [{ id: 't', componentId: 'bearing' }, { id: 'v', componentId: 'bearing' }];
    const unmapped = plannedPaperInspectionScope(assignments, points, []);
    expect(unmapped).toEqual({ pointIds: [], pairs: [], missingTaskMappings: 2 });
    const mapped = plannedPaperInspectionScope(assignments, points, [
      { pmTaskId: 'temperature', inspectionPointId: 't' },
      { pmTaskId: 'vibration', inspectionPointId: 'v' },
    ]);
    expect(mapped).toEqual({
      pointIds: ['t', 'v'], pairs: [
        { pmTaskId: 'temperature', inspectionPointId: 't' },
        { pmTaskId: 'vibration', inspectionPointId: 'v' },
      ], missingTaskMappings: 0,
    });
    expect(plannedPaperInspectionScope(assignments, points, [
      { pmTaskId: 'temperature', inspectionPointId: 't' },
      { pmTaskId: 'vibration', inspectionPointId: 't' },
    ])).toMatchObject({ pointIds: ['t'], missingTaskMappings: 0 });
  });
  it('never borrows points on a different part even if a task ID is reused', () => {
    const s = plannedPaperInspectionScope(
      [{ componentId: 'a', pmTaskId: 'same' }, { componentId: 'b', pmTaskId: 'same' }],
      [{ id: 'a-check', componentId: 'a' }, { id: 'b-check', componentId: 'b' }],
      [{ pmTaskId: 'same', inspectionPointId: 'a-check' }],
    );
    expect(s.pairs).toEqual([
      { pmTaskId: 'same', inspectionPointId: 'a-check' },
      { pmTaskId: 'same', inspectionPointId: 'b-check' },
    ]);
  });
});
