import { describe, expect, it } from 'vitest';
import { groupInspectionPoints } from '@/lib/pm-inspection-grouping';

function point(id: string, machine: string, name: string, part: string, code: string, method = 'measurement') {
  return {
    id, name, inspectionType: method, parameterKey: method === 'measurement' ? 'bearing_temperature_c' : null,
    component: { id: part, name: part, componentCode: code, asset: { id: machine, name: 'Rotary Printing Machine ' + machine, assetTag: machine } },
  };
}

describe('grouped PM inspection points', () => {
  it('shows each machine once, each task once, and every assigned part beneath that task', () => {
    const groups = groupInspectionPoints([
      point('p2', 'RP-01', 'Bearing Temperature', 'Non Drive Bearing', '02'),
      point('p3', 'RP-02', 'Bearing Temperature', 'Roller', '01'),
      point('p1', 'RP-01', 'Bearing Temperature', 'Drive Bearing', '01'),
      point('p4', 'RP-01', 'Bearing Vibration', 'Drive Bearing', '01'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toContain('RP-01');
    expect(groups[0].tasks).toHaveLength(2);
    expect(groups[0].tasks[0].name).toBe('Bearing Temperature');
    expect(groups[0].tasks[0].points.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(groups[1].tasks).toHaveLength(1);
  });

  it('does not combine sight and instrument tasks that have identical names', () => {
    const groups = groupInspectionPoints([
      point('sight', 'RP-01', 'Inspect Bearing', 'Bearing', '01', 'visual'),
      point('meter', 'RP-01', 'Inspect Bearing', 'Bearing', '01', 'measurement'),
    ]);
    expect(groups[0].tasks).toHaveLength(2);
  });

  it('returns no machine cards for an empty result and tolerates unassigned parts', () => {
    expect(groupInspectionPoints([])).toEqual([]);
    const groups = groupInspectionPoints([{...point('x', 'RP-01', 'Temperature', 'Motor', 'A'), component: {
      id: 'Motor', name: 'Motor', componentCode: 'A', asset: null,
    }}]);
    expect(groups[0].name).toBe('Unassigned machine');
  });
});
