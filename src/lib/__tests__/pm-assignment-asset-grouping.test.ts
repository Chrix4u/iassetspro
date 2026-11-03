import { describe, expect, it } from 'vitest';
import {
  groupPmAssignmentAssets,
  groupPmAssignmentTargets,
  pmAssignmentFrequencyType,
  type PmAssignmentTargetListRecord,
} from '@/lib/pm-assignment-target-list';

function row(overrides: Partial<PmAssignmentTargetListRecord> = {}): PmAssignmentTargetListRecord {
  return {
    id: 'assignment-1',
    assetId: 'asset-a',
    componentId: 'part-a1',
    isActive: true,
    pmType: 'cbm',
    basis: 'calendar',
    activityMode: 'inspection',
    equipmentState: 'standstill',
    frequencyInterval: 2,
    frequencyUnit: 'weeks',
    nextDueDate: '2026-11-17',
    nextDueReading: null,
    estimatedMinutes: 20,
    leadDays: 2,
    conditionSourceType: null,
    conditionSourceId: null,
    conditionMetric: null,
    conditionOperator: null,
    conditionThreshold: null,
    conditionThresholdMax: null,
    conditionUnit: null,
    evaluationCadenceMinutes: null,
    asset: { id: 'asset-a', name: 'Stenter 6', assetTag: 'ST-06' },
    component: { id: 'part-a1', name: 'Drive Bearing', componentCode: 'BRG-01', componentType: 'part', parentId: null },
    assetMeter: null,
    pmTask: { id: 'task-1', taskNumber: 1, description: 'Inspect bearing', taskType: 'mechanical' },
    ...overrides,
  };
}

describe('PM asset-first planning groups', () => {
  it('derives frequency from basis instead of PM Type', () => {
    expect(pmAssignmentFrequencyType(row({ pmType: 'cbm', basis: 'calendar' }))).toBe('time_day');
    expect(pmAssignmentFrequencyType(row({ pmType: 'fbm', basis: 'meter' }))).toBe('meter');
    expect(pmAssignmentFrequencyType(row({ pmType: 'tbm', basis: null }))).toBe('event');
  });

  it('rolls multiple scheduled parts into one parent machine', () => {
    const groups = groupPmAssignmentTargets([
      row(),
      row({ id: 'assignment-2', componentId: 'part-a2', component: { id: 'part-a2', name: 'Main Motor', componentCode: 'MTR-01', componentType: 'part', parentId: null }, pmTask: { id: 'task-2', taskNumber: 2, description: 'Lubricate motor', taskType: 'lubrication' } }),
    ]);
    const assets = groupPmAssignmentAssets(groups);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toEqual(expect.objectContaining({
      assetId: 'asset-a',
      targetCount: 2,
      taskCount: 2,
      totalEstimatedMinutes: 40,
    }));
    expect(assets[0].targets.map((target) => target.targetName)).toEqual(['Drive Bearing', 'Main Motor']);
  });

  it('keeps whole-machine PM as a child target under the same machine accordion', () => {
    const groups = groupPmAssignmentTargets([
      row(),
      row({ id: 'assignment-machine', componentId: null, component: null, pmTask: { id: 'task-3', taskNumber: 3, description: 'Inspect whole machine', taskType: 'inspection' } }),
    ]);
    const assets = groupPmAssignmentAssets(groups);
    expect(assets).toHaveLength(1);
    expect(assets[0].targets).toHaveLength(2);
    expect(assets[0].targets.some((target) => target.componentId === null && target.targetType === 'whole_machine')).toBe(true);
  });

  it('keeps machines separate and orders them by asset name', () => {
    const groups = groupPmAssignmentTargets([
      row({ id: 'b-1', assetId: 'asset-b', asset: { id: 'asset-b', name: 'Winder 2', assetTag: 'WN-02' } }),
      row({ id: 'a-1', assetId: 'asset-a', asset: { id: 'asset-a', name: 'Stenter 6', assetTag: 'ST-06' } }),
    ]);
    const assets = groupPmAssignmentAssets(groups);
    expect(assets.map((asset) => asset.asset.name)).toEqual(['Stenter 6', 'Winder 2']);
  });
});
