import { describe, expect, it } from 'vitest';
import {
  inferLegacyLevelMapping,
  planLegacyFunctionalLocationMigration,
  type LegacyMigrationHierarchy,
} from '@/lib/functional-location/legacy-migration';

const hierarchy: LegacyMigrationHierarchy = {
  id: 'system-primary',
  name: 'Primary Functional Location',
  codeMode: 'mixed',
  codeSeparator: '-',
  allowCodeOverride: true,
  levels: [
    { id: 'level-company', order: 1, label: 'Company', isRequired: true, allowAssetAssignment: false, codePrefix: 'CO', isActive: true },
    { id: 'level-plant', order: 2, label: 'Site / Plant', isRequired: true, allowAssetAssignment: false, codePrefix: 'PLT', isActive: true },
    { id: 'level-area', order: 3, label: 'Area', isRequired: false, allowAssetAssignment: false, codePrefix: 'AR', isActive: true },
    { id: 'level-line', order: 4, label: 'Line / System', isRequired: false, allowAssetAssignment: false, codePrefix: 'LN', isActive: true },
    { id: 'level-fl', order: 5, label: 'Functional Location', isRequired: true, allowAssetAssignment: true, codePrefix: 'FL', isActive: true },
  ],
};

const baseAsset = {
  id: 'asset-1',
  assetTag: 'RP-001',
  name: 'Rotary Printer',
  plant: { id: 'plant-1', name: 'Tema Factory', code: 'TEMA' },
  department: { id: 'dept-1', name: 'Printing', code: 'PRT' },
  building: null,
  floor: null,
  area: 'Production Hall',
  location: 'Position 03',
  hasCurrentAssignment: false,
};

const mapping = {
  'level-company': 'company',
  'level-plant': 'plant',
  'level-area': 'area',
  'level-line': null,
  'level-fl': 'location',
} as const;

describe('legacy functional-location migration planner', () => {
  it('infers safe mappings from customer level labels without hard-coding hierarchy depth', () => {
    expect(inferLegacyLevelMapping(hierarchy.levels)).toEqual(mapping);
  });

  it('previews a deterministic coded path while skipping optional unmapped levels', () => {
    const result = planLegacyFunctionalLocationMigration({
      hierarchy,
      mapping,
      company: { name: 'Lightworld Technologies', code: 'LIGHTWORLD' },
      assets: [baseAsset],
    });

    expect(result.summary).toEqual({ totalAssets: 1, readyAssets: 1, blockedAssets: 0, alreadyAssignedAssets: 0, proposedNodes: 4 });
    expect(result.rows[0].status).toBe('ready');
    expect(result.rows[0].path.map((node) => node.name)).toEqual([
      'Lightworld Technologies', 'Tema Factory', 'Production Hall', 'Position 03',
    ]);
    expect(result.rows[0].path.map((node) => node.locationCode)).toEqual([
      'COLIGHTWORLD',
      'COLIGHTWORLD-PLTTEMA',
      'COLIGHTWORLD-PLTTEMA-ARPRODUCTION-HALL',
      'COLIGHTWORLD-PLTTEMA-ARPRODUCTION-HALL-FLPOSITION-03',
    ]);
    expect(result.rows[0].targetLocationCode).toBe('COLIGHTWORLD-PLTTEMA-ARPRODUCTION-HALL-FLPOSITION-03');
  });

  it('blocks only the affected asset when a required mapped legacy value is missing', () => {
    const result = planLegacyFunctionalLocationMigration({
      hierarchy,
      mapping,
      company: { name: 'Lightworld Technologies', code: 'LIGHTWORLD' },
      assets: [{ ...baseAsset, id: 'asset-2', assetTag: 'RP-002', location: '   ' }],
    });

    expect(result.summary.blockedAssets).toBe(1);
    expect(result.summary.readyAssets).toBe(0);
    expect(result.rows[0].status).toBe('blocked');
    expect(result.rows[0].blockers.join(' ')).toMatch(/Functional Location.*location/i);
  });

  it('never proposes overwriting an existing structured assignment', () => {
    const result = planLegacyFunctionalLocationMigration({
      hierarchy,
      mapping,
      company: { name: 'Lightworld Technologies', code: 'LIGHTWORLD' },
      assets: [{ ...baseAsset, hasCurrentAssignment: true }],
    });

    expect(result.summary.alreadyAssignedAssets).toBe(1);
    expect(result.summary.readyAssets).toBe(0);
    expect(result.rows[0]).toMatchObject({ status: 'already_assigned', path: [], targetLocationCode: null });
  });

  it('deduplicates shared proposed nodes across assets while keeping distinct installation leaves', () => {
    const result = planLegacyFunctionalLocationMigration({
      hierarchy,
      mapping,
      company: { name: 'Lightworld Technologies', code: 'LIGHTWORLD' },
      assets: [
        baseAsset,
        { ...baseAsset, id: 'asset-2', assetTag: 'RP-002', location: 'Position 04' },
      ],
    });

    expect(result.summary.readyAssets).toBe(2);
    expect(result.summary.proposedNodes).toBe(5);
    expect(result.proposedNodes.filter((node) => node.hierarchyLevelId === 'level-plant')).toHaveLength(1);
    expect(result.proposedNodes.filter((node) => node.hierarchyLevelId === 'level-fl')).toHaveLength(2);
  });

  it('blocks a later asset when different legacy names collapse to the same derived Location Code', () => {
    const result = planLegacyFunctionalLocationMigration({
      hierarchy,
      mapping,
      company: { name: 'Lightworld Technologies', code: 'LIGHTWORLD' },
      assets: [
        { ...baseAsset, id: 'asset-a', assetTag: 'RP-A', location: 'Position A&B' },
        { ...baseAsset, id: 'asset-b', assetTag: 'RP-B', location: 'Position A B' },
      ],
    });

    expect(result.summary.readyAssets).toBe(1);
    expect(result.summary.blockedAssets).toBe(1);
    expect(result.rows[1].status).toBe('blocked');
    expect(result.rows[1].blockers.join(' ')).toMatch(/same Location Code|collision/i);
  });

  it('blocks automated import planning for manual-code systems rather than inventing codes outside policy', () => {
    const result = planLegacyFunctionalLocationMigration({
      hierarchy: { ...hierarchy, codeMode: 'manual' },
      mapping,
      company: { name: 'Lightworld Technologies', code: 'LIGHTWORLD' },
      assets: [baseAsset],
    });

    expect(result.systemBlockers.join(' ')).toMatch(/manual/i);
    expect(result.summary.readyAssets).toBe(0);
    expect(result.rows[0].status).toBe('blocked');
  });

  it('rejects a global hierarchy node beneath a plant-scoped node', () => {
    const unsafeMapping = {
      ...mapping,
      'level-company': 'plant',
      'level-plant': 'company',
    } as const;
    const result = planLegacyFunctionalLocationMigration({
      hierarchy,
      mapping: unsafeMapping,
      company: { name: 'Lightworld Technologies', code: 'LIGHTWORLD' },
      assets: [baseAsset],
    });

    expect(result.rows[0].status).toBe('blocked');
    expect(result.rows[0].blockers.join(' ')).toMatch(/global|plant-scoped|plant hierarchy/i);
  });

  it('requires the final asset-ready migration target to belong to the asset plant', () => {
    const unsafeMapping = {
      ...mapping,
      'level-fl': 'company',
    } as const;
    const result = planLegacyFunctionalLocationMigration({
      hierarchy,
      mapping: unsafeMapping,
      company: { name: 'Lightworld Technologies', code: 'LIGHTWORLD' },
      assets: [baseAsset],
    });

    expect(result.rows[0].status).toBe('blocked');
    expect(result.rows[0].blockers.join(' ')).toMatch(/asset plant|plant-scoped/i);
  });
});
