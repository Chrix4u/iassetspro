import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import {
  LEGACY_LOCATION_SOURCES,
  inferLegacyLevelMapping,
  planLegacyFunctionalLocationMigration,
  type LegacyAssetLocationRecord,
  type LegacyLevelMapping,
  type LegacyLocationSource,
  type LegacyMigrationHierarchy,
  type LegacyMigrationPlan,
  type ProposedLegacyLocationNode,
} from './legacy-migration';

export interface PreviewLegacyFunctionalLocationMigrationInput {
  hierarchySystemId?: string | null;
  mapping?: LegacyLevelMapping | null;
  plantIds?: string[] | null;
}

export interface LegacyMigrationPreview extends LegacyMigrationPlan {
  previewFingerprint: string;
  safeToImport: boolean;
  database: {
    nodesToCreate: number;
    nodesToReuse: number;
    conflictingNodes: Array<{ locationCode: string; reason: string }>;
  };
}

export interface ImportLegacyFunctionalLocationsInput extends PreviewLegacyFunctionalLocationMigrationInput {
  actorId: string;
  previewFingerprint: string;
}

const ALLOWED_SOURCES = new Set<string>(LEGACY_LOCATION_SOURCES);

function normalizeMapping(
  hierarchy: LegacyMigrationHierarchy,
  mapping: LegacyLevelMapping | null | undefined,
): LegacyLevelMapping {
  const activeLevelIds = new Set(hierarchy.levels.filter((level) => level.isActive).map((level) => level.id));
  if (!mapping) return inferLegacyLevelMapping(hierarchy.levels);

  const normalized: LegacyLevelMapping = {};
  for (const level of hierarchy.levels.filter((item) => item.isActive)) {
    const source = mapping[level.id] ?? null;
    if (source !== null && source !== undefined && !ALLOWED_SOURCES.has(source)) {
      throw new Error(`Unsupported legacy source mapping for ${level.label}: ${String(source)}`);
    }
    normalized[level.id] = (source ?? null) as LegacyLocationSource | null;
  }

  for (const levelId of Object.keys(mapping)) {
    if (!activeLevelIds.has(levelId)) throw new Error(`Mapping references an inactive or unknown hierarchy level: ${levelId}`);
  }
  return normalized;
}

function fingerprintPreview(plan: LegacyMigrationPlan, hierarchy: LegacyMigrationHierarchy): string {
  return createHash('sha256').update(JSON.stringify({
    hierarchy: {
      id: hierarchy.id,
      codeMode: hierarchy.codeMode,
      codeSeparator: hierarchy.codeSeparator,
      allowCodeOverride: hierarchy.allowCodeOverride,
      levels: hierarchy.levels.map((level) => ({
        id: level.id,
        order: level.order,
        label: level.label,
        isRequired: level.isRequired,
        allowAssetAssignment: level.allowAssetAssignment,
        codePrefix: level.codePrefix,
        isActive: level.isActive,
      })),
    },
    mapping: plan.mapping,
    rows: plan.rows.map((row) => ({
      assetId: row.assetId,
      assetTag: row.assetTag,
      plantId: row.plantId,
      status: row.status,
      blockers: row.blockers,
      path: row.path.map((node) => ({
        hierarchyLevelId: node.hierarchyLevelId,
        name: node.name,
        codeSegment: node.codeSegment,
        locationCode: node.locationCode,
        plantId: node.plantId,
      })),
      targetLocationCode: row.targetLocationCode,
    })),
  })).digest('hex');
}

function compatibleNode(existing: {
  hierarchyLevelId: string;
  parentId: string | null;
  name: string;
  plantId: string | null;
  status: string;
}, node: ProposedLegacyLocationNode, expectedParentId: string | null): string | null {
  if (existing.status !== 'active') return 'Existing Location Code is not active';
  if (existing.hierarchyLevelId !== node.hierarchyLevelId) return 'Existing Location Code belongs to a different hierarchy level';
  if (existing.parentId !== expectedParentId) return 'Existing Location Code has a different parent';
  if (existing.plantId !== node.plantId) return 'Existing Location Code belongs to a different plant scope';
  if (existing.name.trim().toLocaleLowerCase() !== node.name.trim().toLocaleLowerCase()) return 'Existing Location Code has a different name';
  return null;
}

async function loadHierarchy(hierarchySystemId?: string | null): Promise<LegacyMigrationHierarchy> {
  const hierarchy = hierarchySystemId
    ? await db.hierarchySystem.findUnique({
        where: { id: hierarchySystemId },
        include: { levels: { where: { isActive: true }, orderBy: { order: 'asc' } } },
      })
    : await db.hierarchySystem.findFirst({
        where: { isPrimary: true, isActive: true },
        include: { levels: { where: { isActive: true }, orderBy: { order: 'asc' } } },
      });

  if (!hierarchy || !hierarchy.isActive) throw new Error('Active hierarchy system not found');
  return {
    id: hierarchy.id,
    name: hierarchy.name,
    codeMode: hierarchy.codeMode,
    codeSeparator: hierarchy.codeSeparator,
    allowCodeOverride: hierarchy.allowCodeOverride,
    levels: hierarchy.levels,
  };
}

async function loadLegacyAssets(hierarchySystemId: string, plantIds?: string[] | null): Promise<LegacyAssetLocationRecord[]> {
  const where = {
    isActive: true,
    ...(plantIds ? { plantId: { in: plantIds } } : {}),
  };
  const assets = await db.asset.findMany({
    where,
    select: {
      id: true,
      assetTag: true,
      name: true,
      building: true,
      floor: true,
      area: true,
      location: true,
      plant: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      functionalLocationAssignments: {
        where: { hierarchySystemId, endedAt: null },
        select: { id: true },
      },
    },
    orderBy: [{ plantId: 'asc' }, { assetTag: 'asc' }],
  });

  return assets.map((asset) => ({
    id: asset.id,
    assetTag: asset.assetTag,
    name: asset.name,
    plant: asset.plant,
    department: asset.department,
    building: asset.building,
    floor: asset.floor,
    area: asset.area,
    location: asset.location,
    hasCurrentAssignment: asset.functionalLocationAssignments.length > 0,
  }));
}

async function classifyExistingNodes(plan: LegacyMigrationPlan) {
  const existing = plan.proposedNodes.length
    ? await db.functionalLocation.findMany({
        where: {
          hierarchySystemId: plan.hierarchySystemId,
          locationCode: { in: plan.proposedNodes.map((node) => node.locationCode) },
        },
        select: { id: true, hierarchyLevelId: true, parentId: true, name: true, locationCode: true, plantId: true, status: true },
      })
    : [];

  const existingByCode = new Map(existing.map((node) => [node.locationCode, node]));
  const resolvedIdByKey = new Map<string, string>();
  const conflicts: Array<{ locationCode: string; reason: string }> = [];
  let nodesToReuse = 0;
  const nodesToCreate = plan.proposedNodes.filter((node) => !existingByCode.has(node.locationCode)).length;

  for (const node of [...plan.proposedNodes].sort((a, b) => a.depth - b.depth || a.locationCode.localeCompare(b.locationCode))) {
    const existingNode = existingByCode.get(node.locationCode);
    if (!existingNode) continue;
    const expectedParentId = node.parentKey ? resolvedIdByKey.get(node.parentKey) ?? null : null;
    const reason = node.parentKey && !resolvedIdByKey.has(node.parentKey)
      ? 'Existing child cannot be verified because its proposed parent does not already exist'
      : compatibleNode(existingNode, node, expectedParentId);
    if (reason) conflicts.push({ locationCode: node.locationCode, reason });
    else {
      nodesToReuse += 1;
      resolvedIdByKey.set(node.key, existingNode.id);
    }
  }

  return { nodesToCreate, nodesToReuse, conflictingNodes: conflicts };
}

export async function previewLegacyFunctionalLocationMigration(
  input: PreviewLegacyFunctionalLocationMigrationInput = {},
): Promise<LegacyMigrationPreview> {
  const hierarchy = await loadHierarchy(input.hierarchySystemId);
  const mapping = normalizeMapping(hierarchy, input.mapping);
  const [company, assets] = await Promise.all([
    db.companyProfile.findFirst({ select: { companyName: true, tradingName: true } }),
    loadLegacyAssets(hierarchy.id, input.plantIds),
  ]);
  if (!company) throw new Error('Company profile is required before migrating legacy functional locations');

  const companyName = company.tradingName?.trim() || company.companyName.trim();
  const plan = planLegacyFunctionalLocationMigration({
    hierarchy,
    mapping,
    company: { name: companyName, code: companyName },
    assets,
  });
  const database = await classifyExistingNodes(plan);
  const previewFingerprint = fingerprintPreview(plan, hierarchy);

  return {
    ...plan,
    previewFingerprint,
    database,
    safeToImport: plan.summary.readyAssets > 0 && plan.systemBlockers.length === 0 && database.conflictingNodes.length === 0,
  };
}

export async function importLegacyFunctionalLocations(input: ImportLegacyFunctionalLocationsInput) {
  const actorId = input.actorId.trim();
  if (!actorId) throw new Error('Migration actor is required');
  const expectedFingerprint = input.previewFingerprint.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint)) throw new Error('A valid preview fingerprint is required');

  const preview = await previewLegacyFunctionalLocationMigration(input);
  if (preview.previewFingerprint !== expectedFingerprint) {
    throw new Error('Legacy location data or mapping changed after preview. Run a fresh preview before importing.');
  }
  if (!preview.safeToImport) {
    throw new Error(preview.database.conflictingNodes[0]?.reason || preview.systemBlockers[0] || 'No migration-ready assets are available');
  }

  const nodes = [...preview.proposedNodes].sort((a, b) => a.depth - b.depth || a.locationCode.localeCompare(b.locationCode));
  const readyRows = preview.rows.filter((row) => row.status === 'ready');

  return db.$transaction(async (tx) => {
    const idByKey = new Map<string, string>();
    let createdNodes = 0;
    let reusedNodes = 0;

    for (const node of nodes) {
      const parentId = node.parentKey ? idByKey.get(node.parentKey) ?? null : null;
      if (node.parentKey && !parentId) throw new Error(`Migration parent could not be resolved for ${node.locationCode}`);

      const existing = await tx.functionalLocation.findUnique({
        where: { hierarchySystemId_locationCode: { hierarchySystemId: preview.hierarchySystemId, locationCode: node.locationCode } },
        select: { id: true, hierarchyLevelId: true, parentId: true, name: true, plantId: true, status: true },
      });

      if (existing) {
        const reason = compatibleNode(existing, node, parentId);
        if (reason) throw new Error(`${node.locationCode}: ${reason}`);
        idByKey.set(node.key, existing.id);
        reusedNodes += 1;
        continue;
      }

      const created = await tx.functionalLocation.create({
        data: {
          hierarchySystemId: preview.hierarchySystemId,
          hierarchyLevelId: node.hierarchyLevelId,
          parentId,
          name: node.name,
          codeSegment: node.codeSegment,
          locationCode: node.locationCode,
          description: `Migrated from legacy ${node.source} data`,
          status: 'active',
          plantId: node.plantId,
          depth: node.depth,
          createdById: actorId,
        },
        select: { id: true },
      });
      idByKey.set(node.key, created.id);
      createdNodes += 1;

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'legacy_import_create',
          entityType: 'functional_location',
          entityId: created.id,
          plantId: node.plantId,
          newValues: JSON.stringify({
            hierarchySystemId: preview.hierarchySystemId,
            hierarchyLevelId: node.hierarchyLevelId,
            parentId,
            name: node.name,
            locationCode: node.locationCode,
            source: node.source,
            previewFingerprint: preview.previewFingerprint,
          }),
        },
      });
    }

    let assignedAssets = 0;
    let skippedAlreadyAssigned = 0;
    for (const row of readyRows) {
      const current = await tx.assetFunctionalLocationAssignment.findFirst({
        where: { assetId: row.assetId, hierarchySystemId: preview.hierarchySystemId, endedAt: null },
        select: { id: true },
      });
      if (current) {
        skippedAlreadyAssigned += 1;
        continue;
      }

      const targetNode = row.path.at(-1);
      if (!targetNode) throw new Error(`Migration target is missing for asset ${row.assetTag}`);
      const functionalLocationId = idByKey.get(targetNode.key);
      if (!functionalLocationId) throw new Error(`Migration target could not be resolved for asset ${row.assetTag}`);

      const assignment = await tx.assetFunctionalLocationAssignment.create({
        data: {
          assetId: row.assetId,
          hierarchySystemId: preview.hierarchySystemId,
          functionalLocationId,
          reason: 'Legacy location migration',
          assignedById: actorId,
        },
        select: { id: true },
      });
      assignedAssets += 1;

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'assign',
          entityType: 'asset_functional_location',
          entityId: assignment.id,
          plantId: row.plantId,
          newValues: JSON.stringify({
            assetId: row.assetId,
            assetTag: row.assetTag,
            hierarchySystemId: preview.hierarchySystemId,
            functionalLocationId,
            locationCode: row.targetLocationCode,
            reason: 'Legacy location migration',
            previewFingerprint: preview.previewFingerprint,
          }),
        },
      });
    }

    const result = {
      hierarchySystemId: preview.hierarchySystemId,
      previewFingerprint: preview.previewFingerprint,
      createdNodes,
      reusedNodes,
      assignedAssets,
      skippedAlreadyAssigned,
      blockedAssetsLeftUnchanged: preview.summary.blockedAssets,
    };

    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'import',
        entityType: 'functional_location_legacy_migration',
        entityId: preview.hierarchySystemId,
        plantId: input.plantIds?.length === 1 ? input.plantIds[0] : null,
        newValues: JSON.stringify({ ...result, mapping: preview.mapping }),
      },
    });

    return result;
  }, { maxWait: 10_000, timeout: 120_000 });
}
