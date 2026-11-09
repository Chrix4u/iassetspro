import { describe, expect, it } from 'vitest';
import {
  hasSystemWorksheetPrefix, isIssuedWorksheetReference,
  newIssuedWorksheetReference, validateIssuedWorksheetUse,
} from '@/lib/pm-issued-paper-worksheet';

const issue = {
  reference: 'PMI-20261109-0123456789ABCDEF',
  assetId: 'machine-1', plantId: 'plant-1', equipmentState: 'running',
  pointIds: ['vibration', 'temperature'],
  issuedAt: new Date('2026-11-09T10:00:00Z'),
};
const entry = {
  reference: issue.reference, assetId: issue.assetId, plantId: issue.plantId,
  equipmentState: issue.equipmentState, pointId: 'vibration',
  fieldInspectedAt: new Date('2026-11-09T10:05:00Z'),
};
describe('registered paper inspection sheet references', () => {
  it('generates time-labeled unpredictable identifiers in the reserved namespace', () => {
    expect(newIssuedWorksheetReference(
      new Date('2026-11-09T10:00:00Z'), '01234567-89ab-cdef-0000-0123456789ab',
    )).toBe(issue.reference);
    expect(isIssuedWorksheetReference(issue.reference)).toBe(true);
    expect(hasSystemWorksheetPrefix('PMI-FAKE')).toBe(true);
    expect(isIssuedWorksheetReference('PMI-FAKE')).toBe(false);
    expect(hasSystemWorksheetPrefix('C314-P267')).toBe(false);
  });
  it('accepts a recorded point only on the right issued machine, state and at the right time', () => {
    expect(validateIssuedWorksheetUse(issue, entry)).toBeNull();
    expect(validateIssuedWorksheetUse(issue, { ...entry, pointId: 'sound' })).toMatch(/not on/);
    expect(validateIssuedWorksheetUse(issue, { ...entry, assetId: 'machine-2' })).toMatch(/another machine/);
    expect(validateIssuedWorksheetUse(issue, { ...entry, plantId: 'plant-2' })).toMatch(/another machine/);
    expect(validateIssuedWorksheetUse(issue, { ...entry, equipmentState: 'standstill' })).toMatch(/another machine/);
    expect(validateIssuedWorksheetUse(issue, { ...entry, fieldInspectedAt: new Date('2026-11-09T09:00:00Z') })).toMatch(/predate/);
  });
  it('rejects malformed or non-issued PMI numbers and a corrupted point snapshot', () => {
    expect(validateIssuedWorksheetUse(null, entry)).toMatch(/not found/);
    expect(validateIssuedWorksheetUse(issue, { ...entry, reference: 'PMI-20261109-NOT-ISSUED' })).toMatch(/Invalid/);
    expect(validateIssuedWorksheetUse({ ...issue, pointIds: null }, entry)).toMatch(/not on/);
  });
});
