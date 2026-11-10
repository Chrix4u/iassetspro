import { describe, expect, it } from 'vitest';
import { buildPaperInspectionTasks } from '@/lib/pm-machine-field-worksheet';
import type { MachineChecklistGroup, MachineChecklistPoint, MachineChecklistTask } from '@/lib/pm-machine-checklist';

const component = (id: string, code: string) => ({
  id, name: id, componentCode: code, componentType: 'part',
  hierarchyPath: [
    { id: 'assembly', code: 'C314-21', name: 'Chain drive', type: 'assembly' },
    { id, code, name: id, type: 'part' },
  ],
});
const task = (id: string, number: number, c: ReturnType<typeof component>): MachineChecklistTask => ({
  id, componentId: c.id, component: c,
  pmTask: { id: 'pm-8', taskNumber: number, description: 'Check sprockets and pulleys', taskType: 'measure' },
  pmType: 'tbm', basis: 'calendar', nextDueDate: null, nextDueReading: null, equipmentState: 'running',
});
const point = (id: string, cId: string, changes: Partial<MachineChecklistPoint> = {}): MachineChecklistPoint => ({
  id, componentId: cId, name: id, description: null, inspectionType: 'measurement',
  parameterKey: 'temperature', normalRange: JSON.stringify({ min: 10, max: 70, unit: '°C' }),
  frequency: 'weekly', nextInspection: null, dueState: 'unscheduled',
  latestRecord: null, openCorrectiveWorkOrder: null, ...changes,
});
describe('paper field inspection worksheet', () => {
  it('prints one task heading followed by ALL assigned parts and their exact registered hierarchy', () => {
    const sprocket = component('sprocket', 'C314-21-02');
    const pulley = component('pulley', 'C314-21-04');
    const groups: MachineChecklistGroup[] = [
      { component: sprocket, tasks: [task('one', 8, sprocket)], points: [point('temperature', sprocket.id)] },
      { component: pulley, tasks: [task('two', 8, pulley)], points: [
        point('vibration', pulley.id, { parameterKey: 'vibration', normalRange: '{"min":0,"max":4.5,"unit":"mm/s"}' }),
        point('sound', pulley.id, { inspectionType: 'visual', parameterKey: null, normalRange: null }),
      ] },
    ];
    const sections = buildPaperInspectionTasks(groups, []);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ number: 8, instruction: 'Check sprockets and pulleys' });
    expect(sections[0].rows).toHaveLength(3);
    expect(sections[0].rows[0].hierarchy.map(node => node.code)).toEqual(['C314-21', 'C314-21-02']);
    expect(sections[0].rows.map(row => row.partCode)).toEqual(['C314-21-02', 'C314-21-04', 'C314-21-04']);
    expect(sections[0].rows.find(row => row.checkName === 'vibration')).toMatchObject({
      acceptedRange: '0 to 4.5', unit: 'mm/s', method: 'Instrument',
    });
    expect(sections[0].rows.find(row => row.checkName === 'sound')?.method).toBe('Sight / sound');
  });
  it('never invents a measurement or duplicates the same task/part/point', () => {
    const bearing = component('bearing', 'C314-10');
    const t = task('one', 8, bearing);
    const one = { component: bearing, tasks: [t, { ...t, id: 'another-assignment' }], points: [point('hot', bearing.id)] };
    const sections = buildPaperInspectionTasks([one], []);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0]).not.toHaveProperty('actual');
  });
  it('flags missing checks, missing parameter, and machine-wide tasks without inventing a part', () => {
    const bearing = component('bearing', 'C314-10');
    const general = task('general', 1, bearing);
    const unassigned = { ...general, pmTask: { ...general.pmTask, id: 'pm-general' }, componentId: null, component: null };
    const unused = component('unused', 'C314-11');
    const sections = buildPaperInspectionTasks([
      { component: bearing, tasks: [task('main', 8, bearing)], points: [point('temp', bearing.id, { parameterKey: null })] },
      { component: unused, tasks: [task('other', 8, unused)], points: [] },
    ], [unassigned]);
    expect(sections[0].rows[0]).toMatchObject({ partCode: 'MACHINE-WIDE', requiresConfiguration: true });
    expect(sections[1].rows).toHaveLength(2);
    expect(sections[1].rows.every(row => row.requiresConfiguration)).toBe(true);
  });
  it('keeps every assigned part in a 125-part machine under the right inspection task', () => {
    const groups: MachineChecklistGroup[] = Array.from({ length: 125 }, (_, index) => {
      const part = component('part-' + index, 'C314-' + String(index + 1).padStart(4, '0'));
      const assigned = index < 100
        ? task('temperature-' + index, 8, part)
        : {
          ...task('vibration-' + index, 9, part),
          pmTask: { id: 'pm-vibration', taskNumber: 9,
            description: 'Measure bearing vibration', taskType: 'measure' },
        };
      return {
        component: part, tasks: [assigned],
        points: [point('reading-' + index, part.id)],
      };
    });
    const sections = buildPaperInspectionTasks(groups, []);
    expect(sections).toHaveLength(2);
    expect(sections[0].number).toBe(8);
    expect(sections[0].rows).toHaveLength(100);
    expect(new Set(sections[0].rows.map((row) => row.partCode)).size).toBe(100);
    expect(sections[1].number).toBe(9);
    expect(sections[1].rows).toHaveLength(25);
    expect(new Set(sections[1].rows.map((row) => row.partCode)).size).toBe(25);
    expect(sections.flatMap((section) => section.rows)).toHaveLength(125);
    expect(sections[0].rows.every((row) => row.pointId && row.hierarchy.length > 0)).toBe(true);
  });

  it('prints only deliberately mapped readings under each task on a shared machine part', () => {
    const bearing = component('bearing', 'C314-21-02');
    const temperature = task('one', 8, bearing);
    const vibration = {
      ...task('two', 9, bearing),
      pmTask: { id: 'pm-vib', taskNumber: 9, description: 'Measure vibration', taskType: 'measure' },
    };
    const group: MachineChecklistGroup = {
      component: bearing, tasks: [temperature, vibration],
      points: [point('temp', bearing.id), point('vib', bearing.id), point('spare', bearing.id)],
    };
    const links = [
      { pmTaskId: 'pm-8', inspectionPointId: 'temp' },
      { pmTaskId: 'pm-vib', inspectionPointId: 'vib' },
      { pmTaskId: 'pm-8', inspectionPointId: 'other-machine-point' },
    ];
    const sections = buildPaperInspectionTasks([group], [], links);
    expect(sections).toHaveLength(2);
    expect(sections[0].rows.map((row) => row.pointId)).toEqual(['temp']);
    expect(sections[1].rows.map((row) => row.pointId)).toEqual(['vib']);
    const ambiguous = buildPaperInspectionTasks([group], [], []);
    expect(ambiguous.flatMap((section) => section.rows)).toHaveLength(2);
    expect(ambiguous[0].rows[0]).toMatchObject({
      pointId: null, requiresConfiguration: true, checkName: 'Task/check mapping not configured',
    });
    expect(ambiguous[1].rows[0].pointId).toBeNull();
  });
  it('warns when instrument range is unknown but leaves a configured point available', () => {
    const c = component('part', 'C314-41');
    const rows = buildPaperInspectionTasks([
      { component: c, tasks: [task('a', 8, c)], points: [point('temperature', c.id, { normalRange: null })] },
    ], [])[0].rows;
    expect(rows[0]).toMatchObject({
      requiresConfiguration: false, acceptedRange: 'Limits NOT CONFIGURED',
      configurationNote: 'No numeric limits: manual assessment required.',
    });
  });
});
