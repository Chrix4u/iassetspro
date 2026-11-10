import { describe, expect, it } from 'vitest';
import {
  inspectionMayAdvanceDue, inspectionPurpose, plannedFieldDate, pmAssignmentDueLabel,
} from '@/lib/pm-early-field-inspection';
import { validateMachineChecklistEntry } from '@/lib/pm-machine-checklist';
import type { MachineChecklistPoint } from '@/lib/pm-machine-checklist';

const now = new Date('2026-11-10T12:00:00Z');
const point: MachineChecklistPoint = {
  id: 'pt1', componentId: 'part1', name: 'Bearing vibration', description: null,
  inspectionType: 'measurement', parameterKey: 'vibration',
  normalRange: JSON.stringify({min:0,max:4.5,unit:'mm/s'}),
  frequency: 'monthly', nextInspection: new Date('2026-11-15'), dueState:'upcoming',
  latestRecord:null,openCorrectiveWorkOrder:null,
};
const entry = (outcome:'pass'|'not_measured', findings:string, value:string) =>
  ({outcome,findings,value,recommendation:'',requestKey:''});
describe('early machine inspection — PM due dates and unavailable readings', () => {
  it('permits 11 Nov field visit before scheduled 15 Nov PM without resetting its due', () => {
    expect(plannedFieldDate('2026-11-11',now)).toBe('2026-11-11');
    expect(pmAssignmentDueLabel({
      basis:'calendar',nextDueDate:'2026-11-15T00:00:00Z',nextDueReading:null,
    })).toBe('2026-11-15');
    expect(inspectionMayAdvanceDue('early_check','pass')).toBe(false);
    expect(inspectionMayAdvanceDue('routine','pass')).toBe(true);
    expect(inspectionMayAdvanceDue('routine','not_measured')).toBe(false);
  });
  it('does not invent invalid calendar dates or accept a new frequency type', () => {
    expect(() => plannedFieldDate('2026-02-30',now)).toThrow();
    expect(() => inspectionPurpose('event')).toThrow();
    expect(pmAssignmentDueLabel({
      basis:'meter',nextDueDate:null,nextDueReading:12000,frequencyUnit:'hours',
    })).toBe('Meter ≥ 12,000 hours');
  });
  it('requires a written reason and never accepts a fabricated zero for N/A', () => {
    expect(validateMachineChecklistEntry(point,entry('not_measured','Stopped machine; no approved vibration test',''))).toBeNull();
    expect(validateMachineChecklistEntry(point,entry('not_measured','stopped',''))).toMatch(/Explain/);
    expect(validateMachineChecklistEntry(point,entry('not_measured','Machine was stopped','0'))).toMatch(/Do not enter/);
    expect(validateMachineChecklistEntry(point,entry('pass','','0'))).toBeNull();
  });
});
