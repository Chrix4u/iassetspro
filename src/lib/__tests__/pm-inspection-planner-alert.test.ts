import { describe, expect, it } from 'vitest';
import { createPlannerInspectionAlert } from '@/lib/pm-inspection-planner-alert';

const base = {
  plannerId: 'planner-1', workOrderId: 'wo-1', woNumber: 'WO-202611-0001',
  assetName: 'Mercerizer C314', partCode: 'C314-21-04', inspectionName: 'Bearing vibration',
  equipmentState: 'running' as const,
  result: 'fail' as const, reading: '9.3', unit: 'mm/s',
};
describe('paper and direct inspection corrective alerts', () => {
  it('generates an actionable in-app planner alert without auto-approving the draft', () => {
    expect(createPlannerInspectionAlert(base)).toMatchObject({
      userId: 'planner-1', type: 'asset_condition',
      entityType: 'work_order', entityId: 'wo-1', actionUrl: 'wo-detail?id=wo-1',
      title: expect.stringContaining('WO-202611-0001'),
      message: expect.stringContaining('9.3 mm/s'),
    });
    expect(createPlannerInspectionAlert(base)?.message).toContain('no repair has been authorized');
  });
  it('avoids notifying the inspector when no eligible plant planner exists', () => {
    expect(createPlannerInspectionAlert({ ...base, plannerId: null })).toBeNull();
  });
  it('handles a sight inspection without inventing an instrument reading', () => {
    const alert = createPlannerInspectionAlert({
      ...base, result: 'needs_attention', reading: null, unit: null,
      equipmentState: 'standstill',
    });
    expect(alert?.message).toContain('qualitative observation');
    expect(alert?.message).toContain('standstill');
  });
});
