import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { FunctionalLocationDomainError } from './service';

export interface AssignAssetToFunctionalLocationInput {
  assetId: string;
  functionalLocationId: string;
  actorId: string;
  reason?: string | null;
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

function requiredId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) validation(`${label} is required`);
  return normalized;
}

const assignmentInclude = {
  hierarchySystem: {
    select: { id: true, name: true, code: true, purpose: true, isPrimary: true, isActive: true },
  },
  functionalLocation: {
    include: {
      hierarchyLevel: { select: { id: true, label: true, order: true, allowAssetAssignment: true } },
      plant: { select: { id: true, name: true, code: true } },
    },
  },
  assignedBy: { select: { id: true, fullName: true, username: true } },
  endedBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.AssetFunctionalLocationAssignmentInclude;

export async function getAssetFunctionalLocationAssignments(assetId: string) {
  const normalizedAssetId = requiredId(assetId, 'Asset');
  return db.assetFunctionalLocationAssignment.findMany({
    where: { assetId: normalizedAssetId },
    include: assignmentInclude,
    orderBy: [{ assignedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getCurrentAssetFunctionalLocations(assetId: string) {
  const normalizedAssetId = requiredId(assetId, 'Asset');
  return db.assetFunctionalLocationAssignment.findMany({
    where: { assetId: normalizedAssetId, endedAt: null },
    include: assignmentInclude,
    orderBy: [{ hierarchySystem: { isPrimary: 'desc' } }, { assignedAt: 'desc' }],
  });
}

export async function assignAssetToFunctionalLocation(input: AssignAssetToFunctionalLocationInput) {
  const assetId = requiredId(input.assetId, 'Asset');
  const functionalLocationId = requiredId(input.functionalLocationId, 'Functional location');
  const actorId = requiredId(input.actorId, 'Audit actor');
  const reason = input.reason?.trim() || null;

  try {
    return await db.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({
        where: { id: assetId },
        select: { id: true, name: true, assetTag: true, plantId: true },
      });
      if (!asset) notFound('Asset not found');

      const target = await tx.functionalLocation.findUnique({
        where: { id: functionalLocationId },
        include: {
          hierarchySystem: true,
          hierarchyLevel: true,
        },
      });
      if (!target) notFound('Functional location not found');
      if (target.status !== 'active') validation('Functional location is not active');
      if (!target.hierarchySystem.isActive) validation('Hierarchy system is not active');
      if (!target.hierarchyLevel.isActive) validation('Hierarchy level is not active');
      if (target.hierarchyLevel.hierarchySystemId !== target.hierarchySystemId) {
        validation('Functional location hierarchy level does not belong to its hierarchy system');
      }
      if (!target.hierarchyLevel.allowAssetAssignment) {
        validation(`Assets cannot be assigned at the ${target.hierarchyLevel.label} level`);
      }
      if (!target.plantId || target.plantId !== asset.plantId) {
        validation('Asset and functional location must belong to the same plant');
      }

      const current = await tx.assetFunctionalLocationAssignment.findFirst({
        where: {
          assetId: asset.id,
          hierarchySystemId: target.hierarchySystemId,
          endedAt: null,
        },
        include: assignmentInclude,
      });

      if (current?.functionalLocationId === functionalLocationId) {
        return current;
      }

      const now = new Date();
      if (current) {
        await tx.assetFunctionalLocationAssignment.update({
          where: { id: current.id },
          data: { endedAt: now, endedById: actorId },
        });
      }

      const created = await tx.assetFunctionalLocationAssignment.create({
        data: {
          assetId: asset.id,
          hierarchySystemId: target.hierarchySystemId,
          functionalLocationId: target.id,
          assignedAt: now,
          reason,
          assignedById: actorId,
        },
        include: assignmentInclude,
      });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: current ? 'relocate' : 'assign',
          entityType: 'asset_functional_location',
          entityId: created.id,
          plantId: asset.plantId,
          oldValues: current
            ? JSON.stringify({
                assignmentId: current.id,
                hierarchySystemId: current.hierarchySystemId,
                functionalLocationId: current.functionalLocationId,
                locationCode: current.functionalLocation.locationCode,
              })
            : null,
          newValues: JSON.stringify({
            assetId: asset.id,
            assetTag: asset.assetTag,
            hierarchySystemId: target.hierarchySystemId,
            functionalLocationId: target.id,
            locationCode: target.locationCode,
            reason,
          }),
        },
      });

      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const current = await db.assetFunctionalLocationAssignment.findFirst({
        where: {
          assetId,
          functionalLocationId,
          endedAt: null,
        },
        include: assignmentInclude,
      });
      if (current) return current;
      conflict('Asset already has a current location in this hierarchy system');
    }
    throw error;
  }
}
