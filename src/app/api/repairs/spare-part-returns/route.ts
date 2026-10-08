import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasRole } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { notifyUser } from '@/lib/notifications';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder, isWorkOrderExecutionMember } from '@/services/workOrderAccess.service';
import { applyPlantScope, canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import {
  createSparePartReturnWithCustody,
  MaterialCustodyConflictError,
  MaterialCustodyNotFoundError,
  MaterialCustodyValidationError,
} from '@/services/materialCustody.service';

// Helper: generate auto-number SPR-YYYYMM-NNNN
async function generateReturnNumber(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `SPR-${ym}-`;

  const lastRecord = await db.sparePartReturn.findFirst({
    where: { returnNumber: { startsWith: prefix } },
    orderBy: { returnNumber: 'desc' },
    select: { returnNumber: true },
  });

  let seq = 1;
  if (lastRecord) {
    const numPart = lastRecord.returnNumber.slice(prefix.length);
    seq = (parseInt(numPart, 10) || 0) + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// GET /api/repairs/spare-part-returns
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const workOrderId = searchParams.get('workOrderId') || undefined;
    const plantId = searchParams.get('plantId') || undefined;
    const itemId = searchParams.get('itemId') || undefined;
    const stats = searchParams.get('stats') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || undefined;
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (plantId && !canAccessPlantStrict(plantScope, plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Stats mode
    if (stats) {
      const statsWhere: Record<string, unknown> = {};
      if (plantId) statsWhere.plantId = plantId; else applyPlantScope(statsWhere, plantScope);
      const [total, byStatus] = await Promise.all([
        db.sparePartReturn.count({ where: statsWhere }),
        db.sparePartReturn.groupBy({
          by: ['status'],
          where: statsWhere,
          _count: { id: true },
        }),
      ]);

      const statusCounts: Record<string, number> = {};
      for (const group of byStatus) {
        statusCounts[group.status] = group._count.id;
      }

      const pendingInspection = await db.sparePartReturn.count({
        where: { ...statsWhere, status: 'pending' },
      });

      const pendingRefurbishment = await db.sparePartReturn.count({
        where: { ...statsWhere, status: 'inspected', refurbishmentNeeded: true },
      });

      const pendingStoreReturn = await db.sparePartReturn.count({
        where: { ...statsWhere, status: 'refurbished' },
      });

      return NextResponse.json({
        success: true,
        data: {
          total,
          byStatus: statusCounts,
          pendingInspection,
          pendingRefurbishment,
          pendingStoreReturn,
        },
      });
    }

    // List mode with filters
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (workOrderId) where.workOrderId = workOrderId;
    if (plantId) where.plantId = plantId; else applyPlantScope(where, plantScope);
    if (itemId) where.itemId = itemId;
    if (search) {
      where.OR = [
        { returnNumber: { contains: search } },
        { itemName: { contains: search } },
        { partSerialNumber: { contains: search } },
      ];
    }

    const hasViewAll = isAdmin(session) || hasRole(session, 'maintenance_supervisor') || hasRole(session, 'maintenance_manager') || hasRole(session, 'plant_manager') || hasRole(session, 'store_keeper') || hasRole(session, 'tools_shop_attendant') || hasRole(session, 'inventory_manager');
    if (!hasViewAll) {
      where.requestedById = session.userId;
    }

    const [returns, total] = await Promise.all([
      db.sparePartReturn.findMany({
        where,
        include: {
          workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
          component: { select: { id: true, componentCode: true, name: true, criticality: true } },
          installedSparePart: { select: { id: true, partName: true, partCode: true, serialNumber: true, quantity: true, status: true, installedAt: true, removedAt: true, removalReason: true, conditionOnRemoval: true } },
          item: { select: { id: true, itemCode: true, name: true, currentStock: true, unitOfMeasure: true } },
          requestedBy: { select: { id: true, fullName: true, username: true, avatar: true } },
          inspectedBy: { select: { id: true, fullName: true } },
          refurbisher: { select: { id: true, fullName: true } },
          returnedToStore: { select: { id: true, fullName: true } },
          disposedByUser: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: Math.min(limit, 100),
      }),
      db.sparePartReturn.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: returns,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch spare part returns';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/repairs/spare-part-returns
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const canCreate = isAdmin(session) || hasRole(session, 'maintenance_technician') || hasRole(session, 'maintenance_supervisor') || hasRole(session, 'store_keeper') || hasRole(session, 'tools_shop_attendant') || hasRole(session, 'inventory_manager');
    if (!canCreate) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to create spare part returns' }, { status: 403 });
    }

    const body = await request.json();
    const {
      workOrderId,
      componentId,
      materialRequestId,
      installedSparePartId,
      removalReason,
      itemId,
      itemName,
      partSerialNumber,
      quantity,
      conditionOnReturn,
      damageDescription,
      refurbishmentNeeded,
      refurbishmentNotes,
      estimatedRefurbCost,
      isConsumed,
    } = body;

    // Plant authorization via linked WO
    if (workOrderId) {
      const plantAuth = await authorizeWorkOrderPlant(request, session, workOrderId);
      if (!plantAuth.ok) return plantAuth.response;
    }

    if (installedSparePartId && materialRequestId) {
      return NextResponse.json(
        { success: false, error: 'A removed installed spare cannot also be re-accounted against material request custody' },
        { status: 400 },
      );
    }

    if (!workOrderId || (!itemName && !installedSparePartId)) {
      return NextResponse.json(
        { success: false, error: 'workOrderId and either itemName or installedSparePartId are required' },
        { status: 400 },
      );
    }

    // Verify work order exists
    const wo = await db.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        assetId: true,
        woNumber: true,
        title: true,
        plantId: true,
        status: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true, role: true, accessLevel: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const returnableWorkOrderStatuses = new Set([
      'planned',
      'assigned',
      'in_progress',
      'on_hold',
      'waiting_parts',
      'waiting_tools',
      'waiting_shutdown',
      'waiting_permit',
      'pending_handover',
      'completed',
    ]);
    if (!returnableWorkOrderStatuses.has(wo.status)) {
      return NextResponse.json(
        { success: false, error: `Spare return custody cannot be opened while work order ${wo.woNumber} is '${wo.status}'` },
        { status: 409 },
      );
    }

    let resolvedComponentId = componentId || null;
    let resolvedItemId = itemId || null;
    let resolvedItemName = String(itemName || '').trim();
    let resolvedPartSerialNumber = partSerialNumber ? String(partSerialNumber).trim() : null;
    let resolvedQuantity = Number(quantity ?? 1);

    if (installedSparePartId) {
      const installedPart = await db.installedSparePart.findUnique({
        where: { id: String(installedSparePartId) },
        include: {
          component: { select: { id: true, assetId: true, asset: { select: { plantId: true } } } },
        },
      });
      if (!installedPart) {
        return NextResponse.json({ success: false, error: 'Installed spare part not found' }, { status: 404 });
      }
      if (installedPart.status !== 'installed' && installedPart.status !== 'removed') {
        return NextResponse.json({ success: false, error: `Installed spare part cannot enter return custody from status '${installedPart.status}'` }, { status: 409 });
      }
      if (
        installedPart.status === 'installed'
        && !isWorkOrderExecutionMember(session, wo)
        && !canManageWorkOrder(session, wo)
      ) {
        return NextResponse.json(
          { success: false, error: 'You are not authorized to remove installed parts for this work order' },
          { status: 403 },
        );
      }
      if (installedPart.status === 'installed' && !String(removalReason || '').trim()) {
        return NextResponse.json({ success: false, error: 'Removal reason is required when removing an installed spare part' }, { status: 400 });
      }
      if (!wo.assetId || installedPart.component.assetId !== wo.assetId) {
        return NextResponse.json({ success: false, error: 'Installed spare part belongs to a different asset than the work order' }, { status: 400 });
      }
      if (componentId && componentId !== installedPart.componentId) {
        return NextResponse.json({ success: false, error: 'Installed spare part belongs to a different component' }, { status: 400 });
      }
      if (itemId && installedPart.inventoryItemId && itemId !== installedPart.inventoryItemId) {
        return NextResponse.json({ success: false, error: 'Installed spare part references a different inventory item' }, { status: 400 });
      }
      if (partSerialNumber && installedPart.serialNumber && String(partSerialNumber).trim() !== installedPart.serialNumber) {
        return NextResponse.json({ success: false, error: 'Serial number does not match the selected installed spare part' }, { status: 400 });
      }
      if (quantity !== undefined && Math.abs(Number(quantity) - installedPart.quantity) > 1e-9) {
        return NextResponse.json({ success: false, error: 'Return quantity must match the selected installed spare quantity' }, { status: 400 });
      }
      resolvedComponentId = installedPart.componentId;
      resolvedItemId = installedPart.inventoryItemId || null;
      resolvedItemName = installedPart.partName;
      resolvedPartSerialNumber = installedPart.serialNumber || null;
      resolvedQuantity = installedPart.quantity;
    }

    // A returned machine part must stay on the same asset as the work order.
    if (resolvedComponentId) {
      const component = await db.componentRegistry.findUnique({
        where: { id: resolvedComponentId },
        select: { id: true, assetId: true },
      });
      if (!component) {
        return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
      }
      if (!wo.assetId || component.assetId !== wo.assetId) {
        return NextResponse.json(
          { success: false, error: 'Component belongs to a different asset than the work order' },
          { status: 400 },
        );
      }
    }

    // Plant identity is server-authoritative from the linked work order.
    const resolvedPlantId = wo.plantId || null;

    // Verify item exists if itemId provided
    if (resolvedItemId) {
      const item = await db.inventoryItem.findUnique({ where: { id: resolvedItemId } });
      if (!item) {
        return NextResponse.json({ success: false, error: 'Inventory item not found' }, { status: 404 });
      }
      if (resolvedPlantId && item.plantId !== resolvedPlantId) {
        return NextResponse.json({ success: false, error: 'Inventory item belongs to a different plant' }, { status: 400 });
      }
    }

    const returnNumber = await generateReturnNumber();

    // Determine status based on consumed flag
    const resolvedIsConsumed = isConsumed === true;
    const resolvedRefurbishmentNeeded = refurbishmentNeeded === true && !resolvedIsConsumed;
    const resolvedStatus = resolvedIsConsumed ? 'disposed' : 'pending';
    const now = new Date();

    const result = await createSparePartReturnWithCustody({
      returnNumber,
      workOrderId,
      componentId: resolvedComponentId,
      materialRequestId: materialRequestId || null,
      installedSparePartId: installedSparePartId || null,
      removalReason: removalReason ? String(removalReason).trim() : null,
      itemId: resolvedItemId,
      itemName: resolvedItemName,
      partSerialNumber: resolvedPartSerialNumber,
      quantity: resolvedQuantity,
      conditionOnReturn: conditionOnReturn || 'used',
      damageDescription: damageDescription || null,
      refurbishmentNeeded: resolvedRefurbishmentNeeded,
      refurbishmentNotes: refurbishmentNotes || null,
      estimatedRefurbCost: estimatedRefurbCost ?? null,
      plantId: resolvedPlantId,
      requestedById: session.userId,
      isConsumed: resolvedIsConsumed,
    });
    const sparePartReturn = result.sparePartReturn;

    if (materialRequestId && result.materialAccounting) {
      await createAuditLog(session.userId, 'RepairMaterialRequest', 'update', materialRequestId, {
        newValues: {
          ...result.materialAccounting,
          sparePartReturnId: sparePartReturn.id,
        },
      });
    }

    // Audit log
    await createAuditLog(session.userId, 'SparePartReturn', 'create', sparePartReturn.id, {
      newValues: {
        returnNumber,
        workOrderId,
        itemName: resolvedItemName,
        installedSparePartId: installedSparePartId || null,
        removalReason: removalReason ? String(removalReason).trim() : null,
        partSerialNumber: resolvedPartSerialNumber,
        quantity: resolvedQuantity,
        conditionOnReturn,
        isConsumed: resolvedIsConsumed,
        refurbishmentNeeded: resolvedRefurbishmentNeeded,
        status: resolvedStatus,
      },
    });

    // Notify relevant users (planner, storekeeper)
    if (wo) {
      const notificationMessage = resolvedIsConsumed
        ? `${returnNumber} for WO ${wo.woNumber}: ${resolvedItemName} recorded as consumed`
        : `${returnNumber} for WO ${wo.woNumber}: ${resolvedItemName} returned for refurbishment`;
      notifyUser(session.userId, 'spare_part_returned', resolvedIsConsumed ? 'Material Recorded as Consumed' : 'Spare Part Return Created', notificationMessage, 'spare_part_return', sparePartReturn.id, 'spare-part-returns').catch(() => {});
    }

    return NextResponse.json({ success: true, data: sparePartReturn }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create spare part return';
    if (error instanceof MaterialCustodyNotFoundError) return NextResponse.json({ success: false, error: message }, { status: 404 });
    if (error instanceof MaterialCustodyValidationError) return NextResponse.json({ success: false, error: message }, { status: 400 });
    if (error instanceof MaterialCustodyConflictError) return NextResponse.json({ success: false, error: message }, { status: 409 });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
