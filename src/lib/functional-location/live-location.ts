import { db } from '@/lib/db';

export interface AssetLiveLocationProjection {
  id: string | null;
  name: string | null;
  locationCode: string | null;
  path: string;
  pathCode: string;
  source: 'structured' | 'legacy';
  legacyPath: string | null;
}

type AssetLegacyRow = {
  id: string;
  location: string | null;
  building: string | null;
  floor: string | null;
  area: string | null;
  plant: { id: string; name: string; code: string } | null;
  department: { id: string; name: string; code: string } | null;
};

type PathNode = {
  id: string;
  hierarchySystemId: string;
  parentId: string | null;
  name: string;
  locationCode: string;
};

function normalizeAssetIds(assetIds: string[]): string[] {
  return [...new Set(assetIds.map((id) => id.trim()).filter(Boolean))];
}

function compactPathSegments(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function legacyPathForAsset(asset: AssetLegacyRow): string {
  return compactPathSegments([
    asset.plant?.name,
    asset.department?.name,
    asset.building,
    asset.floor,
    asset.area,
    asset.location,
  ]).join(' > ');
}

function buildStructuredPath(locationId: string, nodesById: Map<string, PathNode>): string {
  const path: PathNode[] = [];
  const visited = new Set<string>();
  let current = nodesById.get(locationId);

  while (current && !visited.has(current.id) && visited.size < 256) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? nodesById.get(current.parentId) : undefined;
  }

  return path.map((node) => node.name).join(' > ');
}

export async function getAssetLiveLocationMap(
  assetIds: string[],
): Promise<Map<string, AssetLiveLocationProjection | null>> {
  const ids = normalizeAssetIds(assetIds);
  if (ids.length === 0) return new Map();

  const [assets, assignments] = await Promise.all([
    db.asset.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        location: true,
        building: true,
        floor: true,
        area: true,
        plant: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
      },
    }),
    db.assetFunctionalLocationAssignment.findMany({
      where: {
        assetId: { in: ids },
        endedAt: null,
        hierarchySystem: { isPrimary: true, isActive: true },
      },
      include: {
        hierarchySystem: { select: { id: true, isPrimary: true, isActive: true } },
        functionalLocation: {
          select: {
            id: true,
            hierarchySystemId: true,
            parentId: true,
            name: true,
            locationCode: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    }),
  ]);

  const systemIds = [...new Set(assignments.map((assignment) => assignment.hierarchySystemId))];
  const hierarchyNodes = systemIds.length > 0
    ? await db.functionalLocation.findMany({
        where: { hierarchySystemId: { in: systemIds } },
        select: {
          id: true,
          hierarchySystemId: true,
          parentId: true,
          name: true,
          locationCode: true,
        },
      })
    : [];

  const nodesBySystem = new Map<string, Map<string, PathNode>>();
  for (const node of hierarchyNodes) {
    const byId = nodesBySystem.get(node.hierarchySystemId) ?? new Map<string, PathNode>();
    byId.set(node.id, node);
    nodesBySystem.set(node.hierarchySystemId, byId);
  }

  const assignmentByAsset = new Map<string, (typeof assignments)[number]>();
  for (const assignment of assignments) {
    if (!assignmentByAsset.has(assignment.assetId)) assignmentByAsset.set(assignment.assetId, assignment);
  }

  const result = new Map<string, AssetLiveLocationProjection | null>();
  for (const asset of assets) {
    const legacyPath = legacyPathForAsset(asset);
    const assignment = assignmentByAsset.get(asset.id);
    if (assignment) {
      const location = assignment.functionalLocation;
      const structuredPath = buildStructuredPath(
        location.id,
        nodesBySystem.get(assignment.hierarchySystemId) ?? new Map<string, PathNode>(),
      ) || location.name;
      result.set(asset.id, {
        id: location.id,
        name: location.name,
        locationCode: location.locationCode,
        path: structuredPath,
        pathCode: `${location.locationCode} — ${structuredPath}`,
        source: 'structured',
        legacyPath: legacyPath || null,
      });
      continue;
    }

    result.set(asset.id, legacyPath
      ? {
          id: null,
          name: asset.location?.trim() || asset.area?.trim() || asset.department?.name || asset.plant?.name || null,
          locationCode: null,
          path: legacyPath,
          pathCode: legacyPath,
          source: 'legacy',
          legacyPath,
        }
      : null);
  }

  return result;
}

function collectDescendantIds(nodes: Array<Pick<PathNode, 'id' | 'parentId'>>, roots: Iterable<string>): string[] {
  const selected = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || selected.has(current)) continue;
    selected.add(current);
    for (const node of nodes) {
      if (node.parentId === current && !selected.has(node.id)) queue.push(node.id);
    }
  }
  return [...selected];
}

export async function findAssetIdsByLiveLocationSearch(search: string): Promise<string[]> {
  const term = search.trim();
  if (!term) return [];

  const primary = await db.hierarchySystem.findFirst({
    where: { isPrimary: true, isActive: true },
    select: { id: true },
  });

  let structuredAssetIds: string[] = [];
  if (primary) {
    const hierarchyNodes = await db.functionalLocation.findMany({
      where: { hierarchySystemId: primary.id },
      select: { id: true, hierarchySystemId: true, parentId: true, name: true, locationCode: true },
    });
    const normalizedTerm = term.toLocaleLowerCase();
    const matchingRoots = hierarchyNodes
      .filter((node) =>
        node.name.toLocaleLowerCase().includes(normalizedTerm)
        || node.locationCode.toLocaleLowerCase().includes(normalizedTerm))
      .map((node) => node.id);
    const matchingLocationIds = collectDescendantIds(hierarchyNodes, matchingRoots);
    if (matchingLocationIds.length > 0) {
      const assignments = await db.assetFunctionalLocationAssignment.findMany({
        where: {
          endedAt: null,
          hierarchySystemId: primary.id,
          functionalLocationId: { in: matchingLocationIds },
        },
        select: { assetId: true },
      });
      structuredAssetIds = assignments.map((assignment) => assignment.assetId);
    }
  }

  const legacyAssets = await db.asset.findMany({
    where: {
      OR: [
        { location: { contains: term, mode: 'insensitive' } },
        { building: { contains: term, mode: 'insensitive' } },
        { floor: { contains: term, mode: 'insensitive' } },
        { area: { contains: term, mode: 'insensitive' } },
        { plant: { is: { name: { contains: term, mode: 'insensitive' } } } },
        { department: { is: { name: { contains: term, mode: 'insensitive' } } } },
      ],
    },
    select: { id: true },
  });

  return [...new Set([...structuredAssetIds, ...legacyAssets.map((asset) => asset.id)])];
}

export async function getAssetIdsInFunctionalLocationSubtree(
  functionalLocationId: string,
): Promise<string[]> {
  const locationId = functionalLocationId.trim();
  if (!locationId) return [];

  const root = await db.functionalLocation.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      hierarchySystemId: true,
      hierarchySystem: { select: { isPrimary: true, isActive: true } },
    },
  });
  if (!root?.hierarchySystem.isPrimary || !root.hierarchySystem.isActive) return [];

  const nodes = await db.functionalLocation.findMany({
    where: { hierarchySystemId: root.hierarchySystemId },
    select: { id: true, parentId: true },
  });
  const locationIds = collectDescendantIds(nodes, [root.id]);
  if (locationIds.length === 0) return [];

  const assignments = await db.assetFunctionalLocationAssignment.findMany({
    where: {
      endedAt: null,
      hierarchySystemId: root.hierarchySystemId,
      functionalLocationId: { in: locationIds },
    },
    select: { assetId: true },
  });

  return [...new Set(assignments.map((assignment) => assignment.assetId))];
}
