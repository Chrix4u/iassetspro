import { describe, expect, it } from 'vitest';
import { validateManagedPaperReading } from '@/lib/pm-paper-worksheet-validation';
const issuedAt = new Date('2026-11-09T09:00:00.000Z');
const issue = {
  reference: 'IW-C314-20261109-1234567890',
  assetId: 'asset-1', plantId: 'plant-1', equipmentState: 'running',
  pointIds: JSON.stringify(['bearing-temp','pulley-vibration']), issuedAt,
};
const reading = {
  reference: issue.reference, assetId: issue.assetId, plantId: issue.plantId,
  equipmentState: issue.equipmentState, pointId: 'bearing-temp',
  fieldInspectedAt: new Date('2026-11-09T10:00:00.000Z'),
};
describe('registered paper worksheet original-time and scope validation', () => {
  it('accepts a matching machine, state, issued sheet and original field time', () => {
    expect(validateManagedPaperReading(issue, reading)).toBeNull();
  });
  it('rejects missing, cross-machine, cross-plant and wrong-state references', () => {
    expect(validateManagedPaperReading(null, reading)).toMatch(/not found/);
    expect(validateManagedPaperReading(issue, { ...reading, assetId: 'elsewhere' })).toMatch(/another machine/);
    expect(validateManagedPaperReading(issue, { ...reading, plantId: 'another-plant' })).toMatch(/another machine/);
    expect(validateManagedPaperReading(issue, { ...reading, equipmentState: 'standstill' })).toMatch(/another machine/);
  });
  it('rejects an unprinted part or corrupt scope snapshot', () => {
    expect(validateManagedPaperReading(issue, { ...reading, pointId: 'other' })).toMatch(/not included/);
    expect(validateManagedPaperReading({ ...issue, pointIds: 'corrupt' }, reading)).toMatch(/invalid/);
  });
  it('rejects physical inspections pre-dating issuance, preserving legacy paper handling elsewhere', () => {
    expect(validateManagedPaperReading(issue, { ...reading, fieldInspectedAt: null })).toMatch(/before/);
    expect(validateManagedPaperReading(issue, {
      ...reading, fieldInspectedAt: new Date('2026-11-08T10:00:00.000Z'),
    })).toMatch(/before/);
  });
});
