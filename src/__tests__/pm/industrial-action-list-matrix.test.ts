import { describe, expect, it } from 'vitest';
import {
  buildIndustrialInspectionMatrix, industrialHierarchyCodes, industrialInspectionColumn,
  missingIndustrialFieldTimePointIds,
  INDUSTRIAL_INSPECTION_COLUMNS,
} from '@/lib/pm-industrial-inspection-matrix';
import type { PaperInspectionRow, PaperInspectionTask } from '@/lib/pm-machine-field-worksheet';

const hierarchy = [
  { id: 'a', type: 'assembly', code: '01', name: 'Drive Assembly' },
  { id: 's', type: 'subassembly', code: '47', name: 'Transmission' },
  { id: 'c', type: 'component', code: '02', name: 'Chain Drive' },
  { id: 'p', type: 'part', code: 'GT11432', name: 'Chain Sprocket' },
];
const create = (pointId: string, partId: string, parameter: string, checkName: string): PaperInspectionRow => ({
  id: 'task-8:' + partId + ':' + pointId, pointId, partId, partCode: partId,
  partName: 'Chain Sprocket', scheduledDue: '2026-11-15', hierarchy,
  checkName, parameter, method: 'Instrument', acceptedRange: 'MAX 75',
  unit: '°C', requiresConfiguration: false, configurationNote: '',
});
const sections: PaperInspectionTask[] = [
  { id: 't8', number: 8, instruction: 'Check all pulleys and sprockets for looseness', rows: [
    create('temp-a', 'GT11432', 'bearing_temperature', 'Motor temperature'),
    create('vib-a', 'GT11432', 'vibration_rms', 'Vibration'),
    create('sound-a', 'GT11432', 'noise_level', 'Sound'),
    create('corr-a', 'GT11432', 'corrosion', 'Corrosion'),
    create('press-a', 'GT11432', 'pressure_bar', 'Pressure'),
    create('temp-b', 'GT11445', 'temperature', 'Temperature'),
  ]},
  { id: 't9', number: 9, instruction: 'Second PM task shares one checkpoint', rows: [
    create('temp-a', 'GT11432', 'bearing_temperature', 'Motor temperature'),
  ]},
];

describe('industrial PM Action List matrix', () => {
  it('uses concise engineer-approved column names in field and electronic sheets', () => {
    expect(INDUSTRIAL_INSPECTION_COLUMNS.map((c) => c.title)).toEqual(['Temperature', 'Vibration', 'Sound', 'Corrosion']);
  });
  it('categorizes configured checks without inferring a parameter from generic PM task instructions', () => {
    expect(industrialInspectionColumn({ parameter: 'bearing_temperature', checkName: 'Motor heat' })).toBe('temp');
    expect(industrialInspectionColumn({ parameter: 'vibration_rms', checkName: 'Vibration' })).toBe('vib');
    expect(industrialInspectionColumn({ parameter: 'noise_level', checkName: 'SOUND' })).toBe('sound');
    expect(industrialInspectionColumn({ parameter: 'rust_score', checkName: 'Corrosion' })).toBe('corr');
    expect(industrialInspectionColumn({ parameter: 'pressure_bar', checkName: 'Pressure' })).toBe('other');
  });
  it('takes assembly, subassembly and component codes only from the registered hierarchy', () => {
    expect(industrialHierarchyCodes(sections[0].rows[0])).toEqual({
      assembly: '01', subassembly: '47', component: '02',
    });
    const incomplete = { ...sections[0].rows[0], hierarchy: [{ id: 'z', code: 'GT11432', name: 'Sprocket', type: 'part' }] };
    expect(industrialHierarchyCodes(incomplete)).toEqual({ assembly: '—', subassembly: '—', component: '—' });
  });
  it('places multiple parameters of the same assigned part into one row under its PM task', () => {
    const rows = buildIndustrialInspectionMatrix(sections);
    expect(rows[0].parts).toHaveLength(2);
    const sprocket = rows[0].parts.find((p) => p.partCode === 'GT11432')!;
    expect(sprocket.assembly).toBe('01');
    expect(sprocket.subassembly).toBe('47');
    expect(sprocket.component).toBe('02');
    expect(sprocket.checks.temp).toHaveLength(1);
    expect(sprocket.checks.vib).toHaveLength(1);
    expect(sprocket.checks.sound).toHaveLength(1);
    expect(sprocket.checks.corr).toHaveLength(1);
    expect(sprocket.checks.other[0].pointId).toBe('press-a');
    expect(rows[1].parts[0].checks.temp[0].pointId).toBe('temp-a');
  });
  it('fills only blank field times and deduplicates checks shared across tasks', () => {
    const tasks = buildIndustrialInspectionMatrix(sections);
    const draftById: Record<string, { fieldInspectedAt?: string; saved?: boolean }> = {
      'vib-a': { fieldInspectedAt: '2026-11-12T09:30' },
      'sound-a': { saved: true },
    };
    const read = (id: string) => draftById[id] || {};
    const missing = missingIndustrialFieldTimePointIds(tasks, read);
    expect(missing).toEqual(['temp-a', 'corr-a', 'press-a', 'temp-b']);
    // temp-a appears under two PM tasks; it must not get a duplicate update.
    expect(missing.filter((id) => id === 'temp-a')).toHaveLength(1);
    expect(missingIndustrialFieldTimePointIds(tasks.slice(1), read)).toEqual(['temp-a']);
  });
  it('retains unconfigured parts in the paper and electronic sheets instead of hiding them', () => {
    const unconfigured = { ...sections[0].rows[0], id: 'unconfigured', pointId: null, requiresConfiguration: true };
    const rows = buildIndustrialInspectionMatrix([{ id: 'unconfigured', number: 3, instruction: 'Check', rows: [unconfigured] }]);
    expect(rows[0].parts).toHaveLength(1);
    expect(rows[0].parts[0].checks.temp[0].requiresConfiguration).toBe(true);
  });
});
