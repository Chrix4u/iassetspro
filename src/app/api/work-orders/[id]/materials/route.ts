import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder } from '@/services/workOrderAccess.service';

const VALID_URGENCIES = ['low', 'normal', 'medium', 'high', 'critical'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const woAccess = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true } },
      },
    });
    if (!woAccess) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const isExecutionActor =
      woAccess.assignedTo === session.userId ||
      woAccess.teamLeaderId === session.userId ||
      woAccess.teamMembers.some((member) => member.userId === session.userId);
    const canManage =
      hasAnyPermission(session, ['work_orders.update']) &&
      canManageWorkOrder(session, woAccess);
    if (!isExecutionActor && !canManage) {
      return NextResponse.json({ success: false, error: 'Only assigned execution staff or accountable maintenance management can request materials for this work order' }, { status: 403 });
    }

    const body = await request.json();
    const {
      itemName,
      itemId,
      quantity,
      reason,
      notes,
      urgency: rawUrgency,
      unit,
    } = body;

    const qtyRequested = Number(quantity ?? 1);
    if (!Number.isFinite(qtyRequested) || qtyRequested <= 0) {
      return NextResponse.json({ success: false, error: 'quantity must be a positive number' }, { status: 400 });
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        isLocked: true,
        status: true,
        assignedSupervisorId: true,
        plannerId: true,
        woNumber: true,
        plantId: true,
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (!wo.plantId) {
      return NextResponse.json({ success: false, error: 'Operational work order must have a plant' }, { status: 400 });
    }
    if (wo.isLocked) {
      return NextResponse.json({ success: false, error: 'Work order is permanently locked. No modifications are allowed after planner closure.' }, { status: 400 });
    }
    if (wo.status === 'verified' || wo.status === 'closed') {
      return NextResponse.json({ success: false, error: `Work order has been reviewed and material requests are no longer allowed. Status: ${wo.status}` }, { status: 400 });
    }

    const urgency = VALID_URGENCIES.includes(rawUrgency)
      ? (rawUrgency === 'medium' ? 'normal' : rawUrgency)
      : 'normal';

    let resolvedItemName = typeof itemName === 'string' && itemName.trim() ? itemName.trim() : '';
    let resolvedUnit = typeof unit === 'string' && unit.trim() ? unit.trim() : 'each';
    let resolvedUnitCost: number | null = null;
    let stockWarning: string | null = null;

    if (itemId) {
      const invItem = await db.inventoryItem.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          name: true,
          itemCode: true,
          currentStock: true,
          unitOfMeasure: true,
          unitCost: true,
          plantId: true,
        },
      });
      if (!invItem) {
        return NextResponse.json({ success: false, error: `Inventory item ${itemId} not found` }, { status: 400 });
      }
      if (invItem.plantId !== wo.plantId) {
        return NextResponse.json({ success: false, error: 'Selected inventory item belongs to a different plant' }, { status: 400 });
      }

      // Inventory identity and price are server-authoritative. Client-supplied
      // itemName/unitCost/totalCost values are deliberately ignored.
      resolvedItemName = invItem.name;
      resolvedUnit = invItem.unitOfMeasure || resolvedUnit;
      resolvedUnitCost = invItem.unitCost ?? 0;

      if (invItem.currentStock < qtyRequested) {
        stockWarning = `Insufficient stock for ${invItem.name}. Available: ${invItem.currentStock}, Requested: ${qtyRequested}. Shortfall: ${qtyRequested - invItem.currentStock}`;
      }
    }

    if (!resolvedItemName) {
      return NextResponse.json({ success: false, error: 'itemId or itemName is required' }, { status: 400 });
    }

    const estimatedCost = resolvedUnitCost == null ? null : resolvedUnitCost * qtyRequested;

    // Compatibility projection + canonical request must commit together. The
    // canonical RepairMaterialRequest remains the authoritative approval/stock flow.
    const created = await db.$transaction(async (tx) => {
      const material = await tx.workOrderMaterial.create({
        data: {
          workOrderId: id,
          itemName: resolvedItemName,
          itemId: itemId || null,
          quantity: qtyRequested,
          unitCost: resolvedUnitCost,
          totalCost: estimatedCost,
          status: 'requested',
          requestedBy: session.userId,
        },
        include: {
          requester: { select: { id: true, fullName: true, username: true } },
          approver: { select: { id: true, fullName: true } },
          issuer: { select: { id: true, fullName: true } },
        },
      });

      const repairMaterialRequest = await tx.repairMaterialRequest.create({
        data: {
          workOrderId: id,
          itemId: itemId || null,
          itemName: resolvedItemName,
          quantityRequested: qtyRequested,
          quantityApproved: 0,
          quantityIssued: 0,
          quantityReturned: 0,
          unit: resolvedUnit,
          unitCost: resolvedUnitCost,
          estimatedCost: estimatedCost ?? 0,
          urgency,
          reason: reason || `Material requested for work order ${wo.woNumber}`,
          notes: notes || null,
          status: 'pending',
          requestedById: session.userId,
          plantId: wo.plantId,
          source: 'wo_material_add',
        },
        include: {
          requestedBy: { select: { id: true, fullName: true } },
          workOrder: { select: { id: true, woNumber: true, title: true } },
          item: { select: { id: true, itemCode: true, name: true, currentStock: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'create',
          entityType: 'repair_material_request',
          entityId: repairMaterialRequest.id,
          newValues: JSON.stringify({
            workOrderId: id,
            itemId: itemId || null,
            itemName: resolvedItemName,
            quantityRequested: qtyRequested,
            unitCost: resolvedUnitCost,
            urgency,
            source: 'wo_material_add',
            plantId: wo.plantId,
          }),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'create',
          entityType: 'wo_material',
          entityId: material.id,
          newValues: JSON.stringify({
            workOrderId: id,
            itemId: itemId || null,
            itemName: resolvedItemName,
            quantity: qtyRequested,
            unitCost: resolvedUnitCost,
            totalCost: estimatedCost,
            repairMaterialRequestId: repairMaterialRequest.id,
          }),
        },
      });

      return { material, repairMaterialRequest };
    });

    if (wo.assignedSupervisorId) {
      await notifyUser(
        wo.assignedSupervisorId,
        'repair_material_request',
        `${urgency === 'critical' ? '🔴 ' : urgency === 'high' ? '🟠 ' : ''}Material Request Pending Approval`,
        `Material requested: ${qtyRequested} ${resolvedUnit} of ${resolvedItemName} [${urgency.toUpperCase()}] for WO ${wo.woNumber}`,
        'repair_material_request',
        created.repairMaterialRequest.id,
        'maintenance-work-orders'
      );
    }

    if (wo.plannerId && wo.plannerId !== wo.assignedSupervisorId) {
      await notifyUser(
        wo.plannerId,
        'repair_material_request',
        'New Material Request Submitted',
        `${qtyRequested} ${resolvedUnit} of ${resolvedItemName} requested for WO ${wo.woNumber}`,
        'repair_material_request',
        created.repairMaterialRequest.id,
        'maintenance-work-orders'
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...created.material,
        repairMaterialRequest: {
          id: created.repairMaterialRequest.id,
          status: created.repairMaterialRequest.status,
          urgency: created.repairMaterialRequest.urgency,
        },
        ...(stockWarning ? { stockWarning } : {}),
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add material';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
