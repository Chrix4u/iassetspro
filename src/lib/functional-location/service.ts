import { Prisma, type FunctionalLocation, type HierarchySystem } from '@prisma/client';
import { db } from '@/lib/db';
import {
  buildLocationCode,
  normalizeCodeSegment,
  normalizeLocationCode,
  type LocationCodeMode,
} from './location-code';
import { assertNoHierarchyCycle, validateLevelTransition, validatePlantHierarchyPlacement } from './hierarchy-policy';

export type FunctionalLocationErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT';

export class FunctionalLocationDomainError extends Error {
  constructor(
    public readonly code: FunctionalLocationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FunctionalLocationDomainError';
  }
}

export interface CreateFunctionalLocationInput {
  hierarchySystemId: string;
  hierarchyLevelId: string;
  parentId?: string | null;
  name: string;
  codeSegment?: string | null;
  locationCode?: string | null;
  description?: string | null;
  status?: 'active' | 'inactive' | 'retired';
  plantId?: string | null;
  createdById?: string | null;
}

export interface MoveFunctionalLocationInput {
  id: string;
  newParentId: string | null;
  hierarchyLevelId?: string | null;
}

export interface FunctionalLocationPathNode {
  id: string;
  name: string;
  locationCode: string;
  hierarchyLevelId: string;
  levelLabel: string;
  levelOrder: number;
  depth: number;
  plantId: string | null;
  status: string;
}

function validation(message: string): never {
  throw new FunctionalLocationDomainError('VALIDATION', message);
}

function notFound(message: string): never {
  throw new FunctionalLocationDomainError('NOT_FOUND', message);
}

function conflict(message: string): never {
  throw new FunctionalLocationDomainError('CONFLICT', message);
}

function rethrowPrismaConflict(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    conflict(message);
  }
  throw error;
}

function assertActiveSystem(system: { isActive: boolean } | null): asserts system is { isActive: true } {
  if (!system) notFound('Hierarchy system not found');
  if (!system.isActive) validation('Hierarchy system is inactive');
}

export async function setPrimaryHierarchySystem(
  systemId: string,
  _actorId: string,
): Promise<HierarchySystem> {
  return db.$transaction(async (tx) => {
    const target = await tx.hierarchySystem.findUnique({ where: { id: systemId } });
    assertActiveSystem(target);

    await tx.hierarchySystem.updateMany({
      where: { isPrimary: true, id: { not: systemId } },
      data: { isPrimary: false },
    });

    return tx.hierarchySystem.update({
      where: { id: systemId },
      data: { isPrimary: true },
    });
  });
}

export async function createFunctionalLocation(
  input: CreateFunctionalLocationInput,
): Promise<FunctionalLocation> {
  const name = input.name.trim();
  if (!name) validation('Functional location name is required');

  const system = await db.hierarchySystem.findUnique({
    where: { id: input.hierarchySystemId },
    include: {
      levels: {
        where: { isActive: true },
        orderBy: { order: 'asc' },
      },
    },
  });
  assertActiveSystem(system);

  const targetLevel = system.levels.find((level) => level.id === input.hierarchyLevelId);
  if (!targetLevel) validation('Hierarchy level is not active in this hierarchy system');

  const parent = input.parentId
    ? await db.functionalLocation.findUnique({
        where: { id: input.parentId },
        include: { hierarchyLevel: true },
      })
    : null;

  if (input.parentId && !parent) notFound('Parent functional location not found');
  if (parent && parent.hierarchySystemId !== system.id) {
    validation('Parent belongs to a different hierarchy system');
  }
  if (parent && parent.status !== 'active') {
    validation('Parent functional location is not active');
  }

  validateLevelTransition({
    hierarchySystemId: system.id,
    parent: parent
      ? { hierarchySystemId: parent.hierarchySystemId, order: parent.hierarchyLevel.order }
      : null,
    target: { hierarchySystemId: system.id, order: targetLevel.order },
    levels: system.levels.map((level) => ({
      hierarchySystemId: level.hierarchySystemId,
      order: level.order,
      isRequired: level.isRequired,
      isActive: level.isActive,
    })),
  });

  const plantId = input.plantId ?? parent?.plantId ?? null;
  try {
    validatePlantHierarchyPlacement({
      nodePlantId: plantId,
      parentPlantId: parent?.plantId ?? null,
    });
  } catch (error) {
    validation(error instanceof Error ? error.message : 'Invalid plant hierarchy placement');
  }

  const codeSegment = input.codeSegment?.trim()
    ? normalizeCodeSegment(input.codeSegment)
    : null;
  const locationCode = buildLocationCode({
    mode: system.codeMode as LocationCodeMode,
    separator: system.codeSeparator,
    parentCode: parent?.locationCode ?? null,
    prefix: targetLevel.codePrefix,
    segment: codeSegment,
    manualCode: input.locationCode,
    allowOverride: system.allowCodeOverride,
  });

  try {
    return await db.functionalLocation.create({
      data: {
        hierarchySystemId: system.id,
        hierarchyLevelId: targetLevel.id,
        parentId: parent?.id ?? null,
        name,
        codeSegment,
        locationCode: normalizeLocationCode(locationCode),
        description: input.description?.trim() || null,
        status: input.status ?? 'active',
        plantId,
        depth: parent ? parent.depth + 1 : 0,
        createdById: input.createdById ?? null,
      },
    });
  } catch (error) {
    rethrowPrismaConflict(error, `Location Code ${locationCode} already exists in this hierarchy system`);
  }
}

function descendantIdsFor(
  movingId: string,
  nodes: Array<{ id: string; parentId: string | null }>,
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node.id);
    childrenByParent.set(node.parentId, children);
  }

  const descendants: string[] = [];
  const queue = [...(childrenByParent.get(movingId) ?? [])];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) validation('Functional location hierarchy contains a cycle');
    visited.add(id);
    descendants.push(id);
    queue.push(...(childrenByParent.get(id) ?? []));
  }
  return descendants;
}

export async function moveFunctionalLocation(
  input: MoveFunctionalLocationInput,
): Promise<FunctionalLocation> {
  return db.$transaction(async (tx) => {
    const current = await tx.functionalLocation.findUnique({
      where: { id: input.id },
      include: { hierarchyLevel: true, hierarchySystem: true },
    });
    if (!current) notFound('Functional location not found');
    if (!current.hierarchySystem.isActive) validation('Hierarchy system is inactive');

    const levels = await tx.hierarchyLevel.findMany({
      where: { hierarchySystemId: current.hierarchySystemId, isActive: true },
      orderBy: { order: 'asc' },
    });

    const targetLevelId = input.hierarchyLevelId ?? current.hierarchyLevelId;
    const targetLevel = levels.find((level) => level.id === targetLevelId);
    if (!targetLevel) validation('Target hierarchy level is not active in this hierarchy system');

    const newParent = input.newParentId
      ? await tx.functionalLocation.findUnique({
          where: { id: input.newParentId },
          include: { hierarchyLevel: true },
        })
      : null;
    if (input.newParentId && !newParent) notFound('Destination parent functional location not found');
    if (newParent && newParent.hierarchySystemId !== current.hierarchySystemId) {
      validation('Destination parent belongs to a different hierarchy system');
    }
    if (newParent && newParent.status !== 'active') {
      validation('Destination parent functional location is not active');
    }
    try {
      validatePlantHierarchyPlacement({
        nodePlantId: current.plantId,
        parentPlantId: newParent?.plantId ?? null,
      });
    } catch (error) {
      validation(error instanceof Error ? error.message : 'Invalid plant hierarchy placement');
    }

    validateLevelTransition({
      hierarchySystemId: current.hierarchySystemId,
      parent: newParent
        ? { hierarchySystemId: newParent.hierarchySystemId, order: newParent.hierarchyLevel.order }
        : null,
      target: { hierarchySystemId: current.hierarchySystemId, order: targetLevel.order },
      levels: levels.map((level) => ({
        hierarchySystemId: level.hierarchySystemId,
        order: level.order,
        isRequired: level.isRequired,
        isActive: level.isActive,
      })),
    });

    const systemNodes = await tx.functionalLocation.findMany({
      where: { hierarchySystemId: current.hierarchySystemId },
      select: { id: true, parentId: true },
    });
    const descendantIds = descendantIdsFor(current.id, systemNodes);
    assertNoHierarchyCycle({
      movingId: current.id,
      newParentId: newParent?.id ?? null,
      descendantIds,
    });

    const newDepth = newParent ? newParent.depth + 1 : 0;
    const depthDelta = newDepth - current.depth;

    const moved = await tx.functionalLocation.update({
      where: { id: current.id },
      data: {
        parentId: newParent?.id ?? null,
        hierarchyLevelId: targetLevel.id,
        depth: newDepth,
      },
    });

    if (depthDelta !== 0 && descendantIds.length > 0) {
      await tx.functionalLocation.updateMany({
        where: { id: { in: descendantIds } },
        data: { depth: { increment: depthDelta } },
      });
    }

    return moved;
  });
}

export async function getFunctionalLocationPath(
  locationId: string,
): Promise<FunctionalLocationPathNode[]> {
  const location = await db.functionalLocation.findUnique({
    where: { id: locationId },
    select: { id: true, hierarchySystemId: true },
  });
  if (!location) notFound('Functional location not found');

  const nodes = await db.functionalLocation.findMany({
    where: { hierarchySystemId: location.hierarchySystemId },
    include: { hierarchyLevel: true },
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path: FunctionalLocationPathNode[] = [];
  const visited = new Set<string>();
  let current = byId.get(location.id);

  while (current) {
    if (visited.has(current.id)) {
      validation('Functional location hierarchy contains a cycle');
    }
    visited.add(current.id);
    if (visited.size > 256) validation('Functional location path exceeds the supported depth');

    path.unshift({
      id: current.id,
      name: current.name,
      locationCode: current.locationCode,
      hierarchyLevelId: current.hierarchyLevelId,
      levelLabel: current.hierarchyLevel.label,
      levelOrder: current.hierarchyLevel.order,
      depth: current.depth,
      plantId: current.plantId,
      status: current.status,
    });

    if (!current.parentId) break;
    const parent = byId.get(current.parentId);
    if (!parent) validation('Functional location hierarchy references a missing parent');
    current = parent;
  }

  return path;
}
