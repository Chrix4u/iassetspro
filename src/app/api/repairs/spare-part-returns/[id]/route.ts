import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { notifyUser } from '@/lib/notifications';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { MaterialCustodyConflictError, MaterialCustodyNotFoundError, returnSparePartToStore } from '@/services/materialCustody.service';
import {
  canCompleteSpareRefurbishment,
  canDisposeSparePartReturn,
  canEditSparePartReturn,
  canInspectSparePartReturn,
  canRejectSparePartReturn,
  canReturnSparePartToStore,
  canStartSpareRefurbishment,
  canViewAllSparePartReturns,
} from '@/lib/spare-part-return-authorization';

// GET /api/repairs/spare-part-returns/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const actor = { userId: session.userId, roles: session.roles };

    const { id } = await params;

    const sparePartReturn = await db.sparePartReturn.findUnique({
      where: { id },
      include: {
        workOrder: {
          select: {
            id: true, plantId: true, woNumber: true, title: true, status: true,
            assetId: true, assetName: true,
            assignee: { select: { id: true, fullName: true, avatar: true } },
          },
        },
        component: { select: { id: true, componentCode: true, name: true, criticality: true, assetId: true } },
        materialRequest: { select: { id: true, itemName: true, quantityIssued: true } },
        installedSparePart: { select: { id: true, partName: true, partCode: true, serialNumber: true, quantity: true, status: true, installedAt: true, removedAt: true, removalReason: true, conditionOnRemoval: true } },
        item: { select: { id: true, itemCode: true, name: true, currentStock: true, unitOfMeasure: true, binLocation: true } },
        requestedBy: { select: { id: true, fullName: true, username: true, avatar: true } },
        inspectedBy: { select: { id: true, fullName: true, username: true } },
        refurbisher: { select: { id: true, fullName: true, username: true } },
        returnedToStore: { select: { id: true, fullName: true, username: true } },
        disposedByUser: { select: { id: true, fullName: true, username: true } },
      },
    });

    if (!sparePartReturn) {
      return NextResponse.json({ success: false, error: 'Spare part return not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    const plantId = sparePartReturn.workOrder?.plantId;
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (!canViewAllSparePartReturns(actor) && sparePartReturn.requestedById !== session.userId) {
      return NextResponse.json({ success: false, error: 'Access denied — this spare part return is outside your scope' }, { status: 403 });
    }

    const asset = sparePartReturn.workOrder?.assetId
      ? await db.asset.findUnique({
          where: { id: sparePartReturn.workOrder.assetId },
          select: { id: true, name: true, assetTag: true },
        })
      : null;

    const data = {
      ...sparePartReturn,
      workOrder: sparePartReturn.workOrder
        ? {
            ...sparePartReturn.workOrder,
            asset: asset ?? (sparePartReturn.workOrder.assetName
              ? { id: sparePartReturn.workOrder.assetId, name: sparePartReturn.workOrder.assetName, assetTag: null }
              : null),
          }
        : null,
      materialRequest: sparePartReturn.materialRequest
        ? {
            ...sparePartReturn.materialRequest,
            quantity: sparePartReturn.materialRequest.quantityIssued,
          }
        : null,
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch spare part return';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/repairs/spare-part-returns/[id] — update basic fields
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const actor = { userId: session.userId, roles: session.roles };

    const { id } = await params;
    const body = await request.json();

    const existing = await db.sparePartReturn.findUnique({ where: { id }, include: { workOrder: { select: { plantId: true, assetId: true } }, materialRequest: { select: { componentRegistryId: true } } } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Spare part return not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    const recordPlantId = existing.plantId || existing.workOrder?.plantId;
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, recordPlantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const terminalStatuses = ['returned_to_store', 'disposed', 'rejected'];
    if (terminalStatuses.includes(existing.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot update: return is in terminal status '${existing.status}'` },
        { status: 400 },
      );
    }

    if (!canEditSparePartReturn(actor, existing.requestedById)) {
      return NextResponse.json({ success: false, error: 'You can only edit your own spare part returns' }, { status: 403 });
    }

    const identityFields = ['itemName', 'partSerialNumber', 'quantity', 'componentId'];
    if (existing.installedSparePartId && identityFields.some((field) => body[field] !== undefined)) {
      return NextResponse.json(
        { success: false, error: 'Installed-spare identity is locked; edit the installed-part record instead' },
        { status: 400 },
      );
    }

    const allowedFields = ['itemName', 'partSerialNumber', 'quantity', 'conditionOnReturn', 'damageDescription', 'refurbishmentNotes', 'estimatedRefurbCost', 'componentId'];
    const updateData: Record<string, unknown> = {};
    const oldValues: Record<string, unknown> = {};
    const existingRecord = existing as unknown as Record<string, unknown>;
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
        oldValues[field] = existingRecord[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    if (body.quantity !== undefined && existing.materialRequestId) {
      return NextResponse.json(
        { success: false, error: 'Quantity cannot be changed after material custody has been accounted' },
        { status: 400 },
      );
    }
    if (updateData.quantity !== undefined) {
      const nextQuantity = Number(updateData.quantity);
      if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
        return NextResponse.json({ success: false, error: 'quantity must be greater than zero' }, { status: 400 });
      }
      updateData.quantity = nextQuantity;
    }

    if (updateData.componentId !== undefined) {
      const nextComponentId = updateData.componentId ? String(updateData.componentId) : null;
      updateData.componentId = nextComponentId;
      if (existing.materialRequest?.componentRegistryId && nextComponentId !== existing.materialRequest.componentRegistryId) {
        return NextResponse.json(
          { success: false, error: 'Component does not match the linked material request' },
          { status: 400 },
        );
      }
      if (nextComponentId) {
        const component = await db.componentRegistry.findUnique({
          where: { id: nextComponentId },
          select: { id: true, assetId: true },
        });
        if (!component) {
          return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
        }
        if (!existing.workOrder?.assetId || component.assetId !== existing.workOrder?.assetId) {
          return NextResponse.json(
            { success: false, error: 'Component belongs to a different asset than the work order' },
            { status: 400 },
          );
        }
      }
    }

    const updated = await db.sparePartReturn.update({
      where: { id },
      data: updateData,
      include: {
        workOrder: { select: { id: true, woNumber: true, title: true } },
        component: { select: { id: true, componentCode: true, name: true, criticality: true } },
        item: { select: { id: true, itemCode: true, name: true } },
        requestedBy: { select: { id: true, fullName: true } },
      },
    });

    await createAuditLog(session.userId, 'SparePartReturn', 'update', id, {
      oldValues,
      newValues: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update spare part return';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/repairs/spare-part-returns/[id] — workflow actions
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const actor = { userId: session.userId, roles: session.roles };

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const existing = await db.sparePartReturn.findUnique({
      where: { id },
      include: {
        workOrder: { select: { id: true, woNumber: true, title: true, plantId: true } },
        item: true,
        requestedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Spare part return not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, existing.workOrder?.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const now = new Date();

    if (action === 'inspect') {
      if (existing.status !== 'pending') {
        return NextResponse.json({ success: false, error: `Cannot inspect: current status is '${existing.status}', expected 'pending'` }, { status: 400 });
      }
      if (!canInspectSparePartReturn(actor)) {
        return NextResponse.json({ success: false, error: 'Only authorized roles can inspect spare part returns' }, { status: 403 });
      }

      const { refurbishmentNeeded, inspectionNotes } = body;
      if (refurbishmentNeeded === undefined) {
        return NextResponse.json({ success: false, error: 'refurbishmentNeeded is required' }, { status: 400 });
      }

      const updated = await db.sparePartReturn.update({
        where: { id },
        data: {
          status: 'inspected',
          inspectedById: session.userId,
          inspectedAt: now,
          inspectionNotes: inspectionNotes || null,
          refurbishmentNeeded: Boolean(refurbishmentNeeded),
          refurbishmentNotes: body.refurbishmentNotes || null,
          estimatedRefurbCost: body.estimatedRefurbCost || null,
        },
        include: {
          workOrder: { select: { id: true, woNumber: true, title: true } },
          inspectedBy: { select: { id: true, fullName: true } },
        },
      });

      await createAuditLog(session.userId, 'SparePartReturn', 'inspect', id, {
        newValues: { status: 'inspected', refurbishmentNeeded, inspectionNotes },
      });

      await notifyUser(
        existing.requestedById,
        'spare_part_inspected',
        'Spare Part Return Inspected',
        `${existing.returnNumber}: ${refurbishmentNeeded ? 'Refurbishment needed' : 'Ready for return'}`,
        'spare_part_return', id, 'spare-part-returns',
      ).catch(() => {});

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'start_refurbishment') {
      if (existing.status !== 'inspected') {
        return NextResponse.json({ success: false, error: `Cannot start refurbishment: current status is '${existing.status}'` }, { status: 400 });
      }
      if (!existing.refurbishmentNeeded) {
        return NextResponse.json({ success: false, error: 'Refurbishment not needed for this part' }, { status: 400 });
      }
      if (!canStartSpareRefurbishment(actor)) {
        return NextResponse.json({ success: false, error: 'Only admin or maintenance supervisors/managers can start refurbishment' }, { status: 403 });
      }

      const updated = await db.sparePartReturn.update({
        where: { id },
        data: {
          status: 'refurbishing',
          refurbisherId: session.userId,
          refurbishmentStart: now,
        },
        include: {
          workOrder: { select: { id: true, woNumber: true, title: true } },
          refurbisher: { select: { id: true, fullName: true } },
        },
      });

      await createAuditLog(session.userId, 'SparePartReturn', 'start_refurbishment', id, {
        newValues: { status: 'refurbishing', refurbisherId: session.userId },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'complete_refurbishment') {
      if (existing.status !== 'refurbishing') {
        return NextResponse.json({ success: false, error: `Cannot complete refurbishment: current status is '${existing.status}'` }, { status: 400 });
      }
      if (!canCompleteSpareRefurbishment(actor, existing)) {
        return NextResponse.json({ success: false, error: 'Only the assigned refurbisher or authorized maintenance management can complete refurbishment' }, { status: 403 });
      }

      const { actualRefurbCost } = body;

      const updated = await db.sparePartReturn.update({
        where: { id },
        data: {
          status: 'refurbished',
          refurbishmentEnd: now,
          actualRefurbCost: actualRefurbCost ?? existing.estimatedRefurbCost ?? 0,
        },
        include: {
          workOrder: { select: { id: true, woNumber: true, title: true } },
          refurbisher: { select: { id: true, fullName: true } },
          item: { select: { id: true, itemCode: true, name: true } },
        },
      });

      await createAuditLog(session.userId, 'SparePartReturn', 'complete_refurbishment', id, {
        newValues: { status: 'refurbished', actualRefurbCost },
      });

      await notifyUser(
        session.userId,
        'spare_part_refurbished',
        'Spare Part Refurbishment Complete',
        `${existing.returnNumber}: Ready for return to store`,
        'spare_part_return', id, 'spare-part-returns',
      ).catch(() => {});

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'return_to_store') {
      if (!canReturnSparePartToStore(actor)) {
        return NextResponse.json({ success: false, error: 'Only admin, store keeper, inventory manager, or tools shop attendant can return parts to store' }, { status: 403 });
      }

      const updated = await returnSparePartToStore(id, session.userId);

      await createAuditLog(session.userId, 'SparePartReturn', 'return_to_store', id, {
        newValues: { status: 'returned_to_store', itemId: existing.itemId, quantity: existing.quantity },
      });

      await notifyUser(
        existing.requestedById,
        'spare_part_returned_to_store',
        'Spare Part Returned to Store',
        `${existing.returnNumber} has been returned to store inventory`,
        'spare_part_return', id, 'spare-part-returns',
      ).catch(() => {});

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'dispose') {
      if (!['pending', 'inspected', 'refurbishing', 'refurbished'].includes(existing.status)) {
        return NextResponse.json({ success: false, error: `Cannot dispose: current status is '${existing.status}'` }, { status: 400 });
      }
      if (!canDisposeSparePartReturn(actor)) {
        return NextResponse.json({ success: false, error: 'Only authorized roles can dispose spare parts' }, { status: 403 });
      }

      const { disposalReason } = body;
      if (!disposalReason) {
        return NextResponse.json({ success: false, error: 'disposalReason is required' }, { status: 400 });
      }

      const updated = await db.$transaction(async (tx) => {
        const disposed = await tx.sparePartReturn.update({
          where: { id },
          data: {
            status: 'disposed',
            disposedById: session.userId,
            disposedAt: now,
            disposalReason,
          },
          include: {
            workOrder: { select: { id: true, woNumber: true, title: true } },
            disposedByUser: { select: { id: true, fullName: true } },
          },
        });
        if (existing.installedSparePartId) {
          const installedClaim = await tx.installedSparePart.updateMany({
            where: { id: existing.installedSparePartId, status: 'removed' },
            data: { status: 'scrapped' },
          });
          if (installedClaim.count !== 1) throw new MaterialCustodyConflictError('Installed spare custody changed concurrently');
        }
        return disposed;
      });

      await createAuditLog(session.userId, 'SparePartReturn', 'dispose', id, {
        newValues: { status: 'disposed', disposalReason },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'reject') {
      if (existing.installedSparePartId) {
        return NextResponse.json(
          { success: false, error: 'Linked installed spare returns cannot be rejected; inspect the part or dispose it to preserve physical custody history' },
          { status: 400 },
        );
      }
      if (existing.status !== 'pending') {
        return NextResponse.json({ success: false, error: `Cannot reject: current status is '${existing.status}'` }, { status: 400 });
      }
      if (!canRejectSparePartReturn(actor)) {
        return NextResponse.json({ success: false, error: 'Only authorized roles can reject spare part returns' }, { status: 403 });
      }

      const { reason } = body;
      if (!reason) {
        return NextResponse.json({ success: false, error: 'reason is required for rejection' }, { status: 400 });
      }

      const updated = await db.sparePartReturn.update({
        where: { id },
        data: {
          status: 'rejected',
          inspectionNotes: `Rejected: ${reason}`,
          inspectedById: session.userId,
          inspectedAt: now,
        },
        include: {
          workOrder: { select: { id: true, woNumber: true, title: true } },
          inspectedBy: { select: { id: true, fullName: true } },
          requestedBy: { select: { id: true, fullName: true } },
        },
      });

      await createAuditLog(session.userId, 'SparePartReturn', 'reject', id, {
        newValues: { status: 'rejected', reason },
      });

      await notifyUser(
        existing.requestedById,
        'spare_part_rejected',
        'Spare Part Return Rejected',
        `${existing.returnNumber}: ${reason}`,
        'spare_part_return', id, 'spare-part-returns',
      ).catch(() => {});

      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process spare part return action';
    if (error instanceof MaterialCustodyNotFoundError) return NextResponse.json({ success: false, error: message }, { status: 404 });
    if (error instanceof MaterialCustodyConflictError) return NextResponse.json({ success: false, error: message }, { status: 409 });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
