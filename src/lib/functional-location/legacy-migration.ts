import { buildLocationCode, type LocationCodeMode } from './location-code';

export const LEGACY_LOCATION_SOURCES = [
  'company', 'plant', 'department', 'building', 'floor', 'area', 'location',
] as const;

export type LegacyLocationSource = (typeof LEGACY_LOCATION_SOURCES)[number];
export type LegacyLevelMapping = Record<string, LegacyLocationSource | null | undefined>;

export interface LegacyMigrationLevel {
  id: string;
  order: number;
  label: string;
  isRequired: boolean;
  allowAssetAssignment: boolean;
  codePrefix: string | null;
  isActive: boolean;
}

export interface LegacyMigrationHierarchy {
  id: string;
  name: string;
  codeMode: string;
  codeSeparator: string;
  allowCodeOverride: boolean;
  levels: LegacyMigrationLevel[];
}

export interface LegacyAssetLocationRecord {
  id: string;
  assetTag: string;
  name: string;
  plant: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  building: string | null;
  floor: string | null;
  area: string | null;
  location: string | null;
  hasCurrentAssignment: boolean;
}

export interface ProposedLegacyLocationNode {
  key: string;
  hierarchyLevelId: string;
  levelLabel: string;
  parentKey: string | null;
  name: string;
  codeSegment: string;
  locationCode: string;
  plantId: string | null;
  depth: number;
  source: LegacyLocationSource;
}

export interface LegacyMigrationPlanRow {
  assetId: string;
  assetTag: string;
  assetName: string;
  plantId: string;
  status: 'ready' | 'blocked' | 'already_assigned';
  blockers: string[];
  path: ProposedLegacyLocationNode[];
  targetLocationCode: string | null;
}

export interface LegacyMigrationPlan {
  hierarchySystemId: string;
  mapping: LegacyLevelMapping;
  systemBlockers: string[];
  summary: {
    totalAssets: number;
    readyAssets: number;
    blockedAssets: number;
    alreadyAssignedAssets: number;
    proposedNodes: number;
  };
  proposedNodes: ProposedLegacyLocationNode[];
  rows: LegacyMigrationPlanRow[];
}

export interface PlanLegacyMigrationInput {
  hierarchy: LegacyMigrationHierarchy;
  mapping: LegacyLevelMapping;
  company: { name: string; code?: string | null };
  assets: LegacyAssetLocationRecord[];
}

function normalizedLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function inferLegacyLevelMapping(levels: LegacyMigrationLevel[]): LegacyLevelMapping {
  const mapping: LegacyLevelMapping = {};

  for (const level of levels.filter((item) => item.isActive)) {
    const label = normalizedLabel(level.label);
    let source: LegacyLocationSource | null = null;

    if (/\b(company|organisation|organization|business)\b/.test(label)) source = 'company';
    else if (/\b(site|plant|factory)\b/.test(label)) source = 'plant';
    else if (/\b(department|dept)\b/.test(label)) source = 'department';
    else if (/\b(building|block)\b/.test(label)) source = 'building';
    else if (/\b(floor|storey|story)\b/.test(label)) source = 'floor';
    else if (/\b(area|zone|section)\b/.test(label)) source = 'area';
    else if (/\bfunctional location\b/.test(label) || /\b(position|location)\b/.test(label)) source = 'location';

    mapping[level.id] = source;
  }

  return mapping;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function codeSegment(value: string): string {
  const segment = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  if (!segment) throw new Error(`Cannot derive a Location Code segment from "${value}"`);
  return segment;
}

function sourceValue(
  source: LegacyLocationSource,
  asset: LegacyAssetLocationRecord,
  company: PlanLegacyMigrationInput['company'],
): { name: string | null; segmentSeed: string | null; plantId: string | null } {
  switch (source) {
    case 'company': {
      const name = clean(company.name);
      return { name, segmentSeed: clean(company.code) || name, plantId: null };
    }
    case 'plant':
      return { name: clean(asset.plant.name), segmentSeed: clean(asset.plant.code) || clean(asset.plant.name), plantId: asset.plant.id };
    case 'department':
      return {
        name: clean(asset.department?.name),
        segmentSeed: clean(asset.department?.code) || clean(asset.department?.name),
        plantId: asset.plant.id,
      };
    case 'building':
    case 'floor':
    case 'area':
    case 'location': {
      const value = clean(asset[source]);
      return { name: value, segmentSeed: value, plantId: asset.plant.id };
    }
  }
}

function nodeKey(levelId: string, parentKey: string | null, locationCode: string, plantId: string | null): string {
  return [levelId, parentKey || 'ROOT', plantId || 'GLOBAL', locationCode].join('::');
}

export function planLegacyFunctionalLocationMigration(input: PlanLegacyMigrationInput): LegacyMigrationPlan {
  const levels = [...input.hierarchy.levels]
    .filter((level) => level.isActive)
    .sort((a, b) => a.order - b.order);
  const systemBlockers: string[] = [];

  if (input.hierarchy.codeMode === 'manual') {
    systemBlockers.push('Automated legacy migration is unavailable for manual Location Code systems. Switch to mixed/generated mode or create locations manually.');
  } else if (!['mixed', 'generated'].includes(input.hierarchy.codeMode)) {
    systemBlockers.push(`Unsupported Location Code mode: ${input.hierarchy.codeMode}`);
  }
  if (!levels.length) systemBlockers.push('The hierarchy system has no active levels.');

  const proposedByKey = new Map<string, ProposedLegacyLocationNode>();
  const rows: LegacyMigrationPlanRow[] = [];

  for (const asset of input.assets) {
    if (asset.hasCurrentAssignment) {
      rows.push({
        assetId: asset.id,
        assetTag: asset.assetTag,
        assetName: asset.name,
        plantId: asset.plant.id,
        status: 'already_assigned',
        blockers: [],
        path: [],
        targetLocationCode: null,
      });
      continue;
    }

    const blockers = [...systemBlockers];
    const path: ProposedLegacyLocationNode[] = [];
    let parentCode: string | null = null;
    let parentKey: string | null = null;
    let parentPlantId: string | null | undefined = undefined;

    for (const level of levels) {
      const source = input.mapping[level.id] ?? null;
      if (!source) {
        if (level.isRequired) blockers.push(`${level.label} is required but has no legacy field mapping.`);
        continue;
      }

      const legacy = sourceValue(source, asset, input.company);
      if (!legacy.name || !legacy.segmentSeed) {
        if (level.isRequired) blockers.push(`${level.label} requires legacy ${source} data for asset ${asset.assetTag}.`);
        continue;
      }

      if (parentKey && parentPlantId !== null && legacy.plantId === null) {
        blockers.push(`${level.label} is global but its parent is plant-scoped. Global hierarchy nodes cannot sit beneath plant-specific nodes.`);
      }
      if (parentKey && parentPlantId && legacy.plantId && parentPlantId !== legacy.plantId) {
        blockers.push(`${level.label} belongs to a different plant than its parent.`);
      }

      let segment: string;
      let locationCode: string;
      try {
        segment = codeSegment(legacy.segmentSeed);
        locationCode = buildLocationCode({
          mode: input.hierarchy.codeMode as LocationCodeMode,
          separator: input.hierarchy.codeSeparator,
          parentCode,
          prefix: level.codePrefix,
          segment,
          allowOverride: false,
        });
      } catch (error) {
        blockers.push(`${level.label}: ${error instanceof Error ? error.message : 'could not derive Location Code'}`);
        continue;
      }

      const key = nodeKey(level.id, parentKey, locationCode, legacy.plantId);
      const node: ProposedLegacyLocationNode = {
        key,
        hierarchyLevelId: level.id,
        levelLabel: level.label,
        parentKey,
        name: legacy.name,
        codeSegment: segment,
        locationCode,
        plantId: legacy.plantId,
        depth: path.length,
        source,
      };
      path.push(node);
      parentCode = locationCode;
      parentKey = key;
      parentPlantId = legacy.plantId;
    }

    const targetLevel = path.length
      ? levels.find((level) => level.id === path[path.length - 1].hierarchyLevelId)
      : null;
    if (!targetLevel?.allowAssetAssignment) {
      blockers.push('The final migrated hierarchy node does not allow asset assignment. Map an asset-ready level to legacy data.');
    }
    const targetNode = path.at(-1);
    if (targetLevel?.allowAssetAssignment && targetNode?.plantId !== asset.plant.id) {
      blockers.push('The final asset-ready migration target must be plant-scoped to the asset plant.');
    }

    for (const node of path) {
      const existingProposal = proposedByKey.get(node.key);
      if (existingProposal && existingProposal.name.trim().toLocaleLowerCase() !== node.name.trim().toLocaleLowerCase()) {
        blockers.push(
          `Legacy values "${existingProposal.name}" and "${node.name}" derive the same Location Code ${node.locationCode}; reconcile this collision before import.`,
        );
      }
    }

    const status: LegacyMigrationPlanRow['status'] = blockers.length ? 'blocked' : 'ready';
    if (status === 'ready') {
      for (const node of path) proposedByKey.set(node.key, node);
    }

    rows.push({
      assetId: asset.id,
      assetTag: asset.assetTag,
      assetName: asset.name,
      plantId: asset.plant.id,
      status,
      blockers,
      path: status === 'ready' ? path : [],
      targetLocationCode: status === 'ready' ? path.at(-1)?.locationCode ?? null : null,
    });
  }

  return {
    hierarchySystemId: input.hierarchy.id,
    mapping: input.mapping,
    systemBlockers,
    summary: {
      totalAssets: rows.length,
      readyAssets: rows.filter((row) => row.status === 'ready').length,
      blockedAssets: rows.filter((row) => row.status === 'blocked').length,
      alreadyAssignedAssets: rows.filter((row) => row.status === 'already_assigned').length,
      proposedNodes: proposedByKey.size,
    },
    proposedNodes: [...proposedByKey.values()],
    rows,
  };
}
