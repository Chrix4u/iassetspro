import { describe, expect, it } from 'vitest';
import { inspectionTaskPointLinkStatus, validateInspectionTaskPointSelection } from '../pm-explicit-inspection-task-points';

describe('PM inspection task ↔ exact part checkpoint mapping', () => {
  const eligible = ['temperature', 'vibration', 'sound'];
  it('accepts only explicit active checkpoints of the selected part', () => {
    expect(validateInspectionTaskPointSelection(['temperature','sound'], eligible)).toEqual({
      pointIds: ['temperature','sound'], error: null,
    });
    expect(validateInspectionTaskPointSelection(['different-part'], eligible).error).toMatch(/active machine part/);
    expect(validateInspectionTaskPointSelection(['temperature','temperature'], eligible).error).toMatch(/Duplicate/);
    expect(validateInspectionTaskPointSelection(['temperature',123], eligible).error).toMatch(/valid strings/);
    expect(validateInspectionTaskPointSelection(Array(251).fill('temperature'), eligible).error).toMatch(/at most 250/);
  });
  it('permits deliberate clearing of a task mapping', () => {
    expect(validateInspectionTaskPointSelection([], eligible)).toEqual({ pointIds: [], error: null });
  });
  it('never assumes every point on a part belongs to every PM task', () => {
    const tasks = [{ pmTaskId:'inspect-temperature' }, { pmTaskId:'inspect-vibration' }];
    const points = [{id:'temp'},{id:'vib'}];
    const links = [
      { pmTaskId:'inspect-temperature', inspectionPointId:'temp' },
      { pmTaskId:'inspect-vibration', inspectionPointId:'vib' },
      { pmTaskId:'other-plant-task', inspectionPointId:'vib' },
      { pmTaskId:'inspect-temperature', inspectionPointId:'other-part' },
    ];
    expect(inspectionTaskPointLinkStatus(tasks,points,links)).toMatchObject({
      mode:'explicit', byTask:{ 'inspect-temperature':['temp'], 'inspect-vibration':['vib'] },
    });
    expect(inspectionTaskPointLinkStatus(tasks,points,[])).toMatchObject({
      mode:'unconfigured', byTask:{ 'inspect-temperature':[], 'inspect-vibration':[] },
    });
  });
  it('supports the same inspection point deliberately linked to two tasks', () => {
    const result = inspectionTaskPointLinkStatus(
      [{pmTaskId:'t1'},{pmTaskId:'t2'}], [{id:'p1'}],
      [{pmTaskId:'t1',inspectionPointId:'p1'},{pmTaskId:'t2',inspectionPointId:'p1'}],
    );
    expect(result.byTask).toEqual({t1:['p1'],t2:['p1']});
  });
});
