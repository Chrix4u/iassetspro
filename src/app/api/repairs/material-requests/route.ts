import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, applyPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { notifyUser } from '@/lib/notifications';
import { materialRequestReason } from '@/lib/technician-reason-defaults';

const URGENCY_ORDER: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 };
const VALID_URGENCIES = ['low', 'normal', 'high', 'critical'];
const OVERDUE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.view_own']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workOrderId = searchParams.get('workOrderId');
    const status = searchParams.get('status');
    const requestedById = searchParams.get('requestedById');
    const urgency = searchParams.get('urgency');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const stats = searchParams.get('stats') === 'true';

    const where: Record<string, unknown> = {};
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    // Always apply plant scope. With no explicit header this limits the query to
    // all and only the user's accessible plants.
    applyPlantScope(where, plantScope);

    if (workOrderId) where.workOrderId = workOrderId;
    if (status) where.status = status;
    if (requestedById) where.requestedById = requestedById;
    if (urgency && VALID_URGENCIES.includes(urgency)) where.urgency = urgency;

    const canViewAll = hasAnyPermission(session, ['repair_material_requests.view', 'repair_material_requests.view_all']) || isAdmin(session);
    let canViewWorkOrderExecutionScope = false;
    if (!canViewAll && workOrderId) {
      const executionMembership = await db.workOrder.findFirst({
        where: {
          id: workOrderId,
          OR: [
            { assignedTo: session.userId },
            { teamLeaderId: session.userId },
            { teamMembers: { some: { userId: session.userId } } },
          ],
        },
        select: { id: true },
      });
      canViewWorkOrderExecutionScope = !!executionMembership;
    }
    if (!canViewAll && !canViewWorkOrderExecutionScope) where.requestedById = session.userId;

    if (stats) {
      try {
        const [total, pending, supervisorApproved, storekeeperApproved, issued, returned, rejected, overdueCount, urgencyBreakdown] = await Promise.all([
          db.repairMaterialRequest.count({ where }),
          db.repairMaterialRequest.count({ where: { ...where, status: 'pending' } }),
          db.repairMaterialRequest.count({ where: { ...where, status: 'supervisor_approved' } }),
          db.repairMaterialRequest.count({ where: { ...where, status: 'storekeeper_approved' } }),
          db.repairMaterialRequest.count({ where: { ...where, status: 'issued' } }),
          db.repairMaterialRequest.count({ where: { ...where, status: { in: ['partially_returned', 'fully_returned', 'closed'] } } }),
          db.repairMaterialRequest.count({ where: { ...where, status: 'rejected' } }),
          db.repairMaterialRequest.count({ where: { ...where, status: 'pending', createdAt: { lt: new Date(Date.now() - OVERDUE_THRESHOLD_MS) } } }),
          db.repairMaterialRequest.groupBy({ by: ['urgency'], where, _count: { urgency: true } }),
        ]);

        return NextResponse.json({
          success: true,
          data: {
            total,
            byStatus: { pending, supervisorApproved, storekeeperApproved, issued, returned, rejected },
            overdueCount,
            urgency: urgencyBreakdown.map((g) => ({ level: g.urgency, count: g._count.urgency })),
          },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load material request stats';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
      }
    }

    try {
      const [requests, total] = await Promise.all([
        db.repairMaterialRequest.findMany({
          where,
          include: {
            requestedBy: { select: { id: true, fullName: true, username: true } },
            supervisorApprovedBy: { select: { id: true, fullName: true } },
            storekeeperApprovedBy: { select: { id: true, fullName: true } },
            issuedByUser: { select: { id: true, fullName: true } },
            returnedByUser: { select: { id: true, fullName: true } },
            workOrder: {
              select: {
                id: true, woNumber: true, title: true, status: true,
                assignedSupervisorId: true,
                assignedTo: true, teamLeaderId: true,
                teamMembers: { select: { userId: true, role: true } },
              },
            },
            item: { select: { id: true, itemCode: true, name: true, currentStock: true, unitOfMeasure: true } },
            componentRegistry: { select: { id: true, name: true, componentCode: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.repairMaterialRequest.count({ where }),
      ]);

      const now = Date.now();
      const enriched = requests.map((req) => ({
        ...req,
        isOverdue: req.status === 'pending' && now - new Date(req.createdAt).getTime() > OVERDUE_THRESHOLD_MS,
      }));
      enriched.sort((a, b) => {
        const urgencyDiff = (URGENCY_ORDER[b.urgency] || 0) - (URGENCY_ORDER[a.urgency] || 0);
        if (urgencyDiff !== 0) return urgencyDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return NextResponse.json({ success: true, data: enriched, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load material requests';
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load material requests';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'repair_material_requests.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { workOrderId, itemId, itemName, quantityRequested, unit, reason, notes, urgency, componentRegistryId } = body;
    if (!workOrderId || (!itemId && !itemName)) {
      return NextResponse.json({ success: false, error: 'workOrderId and itemId or itemName are required' }, { status: 400 });
    }
    const requestedQuantity = Number(quantityRequested);
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      return NextResponse.json({ success: false, error: 'quantityRequested must be a positive number' }, { status: 400 });
    }

    const resolvedUrgency = VALID_URGENCIES.includes(urgency) ? urgency : 'normal';
    const wo = await db.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    if (!wo.plantId) return NextResponse.json({ success: false, error: 'Operational work order must have a plant' }, { status: 400 });

    const woTeam = await db.workOrderTeamMember.findFirst({ where: { workOrderId, userId: session.userId } });
    const isAssignee = wo.assignedTo === session.userId;
    if (!woTeam && !isAssignee && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'You are not a member of this work order\'s execution team' }, { status: 403 });
    }

    if (componentRegistryId) {
      const linkedComponent = await db.workOrderComponent.findUnique({
        where: {
          workOrderId_componentRegistryId: {
            workOrderId,
            componentRegistryId,
          },
        },
        select: { id: true },
      });
      if (!linkedComponent) {
        return NextResponse.json({ success: false, error: 'Selected component is not linked to this work order' }, { status: 400 });
      }
    }

    let currentStock: number | null = null;
    let resolvedUnitCost: number | null = null;
    let stockWarning: string | null = null;
    let resolvedItemName = typeof itemName === 'string' && itemName.trim() ? itemName.trim() : '';
    let resolvedUnit = typeof unit === 'string' && unit.trim() ? unit.trim() : 'each';

    if (itemId) {
      const invItem = await db.inventoryItem.findUnique({ where: { id: itemId } });
      if (!invItem) return NextResponse.json({ success: false, error: `Inventory item ${itemId} not found` }, { status: 400 });
      if (invItem.plantId !== wo.plantId) return NextResponse.json({ success: false, error: 'Selected inventory item belongs to a different plant' }, { status: 400 });

      currentStock = invItem.currentStock;
      resolvedItemName = invItem.name;
      resolvedUnit = invItem.unitOfMeasure || resolvedUnit;
      resolvedUnitCost = invItem.unitCost ?? 0;

      if (invItem.currentStock < requestedQuantity) {
        stockWarning = `Insufficient stock for ${invItem.name}. Available: ${invItem.currentStock}, Requested: ${requestedQuantity}. Shortfall: ${requestedQuantity - invItem.currentStock}`;
      } else if (invItem.currentStock < requestedQuantity * 2) {
        const remainingAfterIssue = invItem.currentStock - requestedQuantity;
        if (remainingAfterIssue < invItem.currentStock * 0.1) {
          stockWarning = `Low stock warning: issuing ${requestedQuantity} would leave only ${remainingAfterIssue} units of ${invItem.name} in inventory.`;
        }
      }
    }

    const resolvedReason = typeof reason === 'string' && reason.trim()
      ? reason.trim()
      : materialRequestReason({ woNumber: wo.woNumber, title: wo.title, itemName: resolvedItemName });

    const estimatedCost = requestedQuantity * (resolvedUnitCost ?? 0);
    const matReq = await db.repairMaterialRequest.create({
      data: {
        workOrderId,
        itemId: itemId || null,
        itemName: resolvedItemName,
        quantityRequested: requestedQuantity,
        quantityApproved: 0,
        quantityIssued: 0,
        quantityReturned: 0,
        unit: resolvedUnit,
        unitCost: resolvedUnitCost,
        estimatedCost,
        urgency: resolvedUrgency,
        reason: resolvedReason,
        notes: notes || null,
        status: 'pending',
        plantId: wo.plantId,
        requestedById: session.userId,
        componentRegistryId: componentRegistryId || null,
      },
      include: {
        requestedBy: { select: { id: true, fullName: true } },
        workOrder: { select: { id: true, woNumber: true, title: true } },
        item: { select: { id: true, itemCode: true, name: true, currentStock: true } },
        componentRegistry: { select: { id: true, name: true, componentCode: true } },
      },
    });

    if (wo.assignedSupervisorId) {
      await notifyUser(wo.assignedSupervisorId, 'repair_material_request', `${resolvedUrgency === 'critical' ? '🔴 ' : resolvedUrgency === 'high' ? '🟠 ' : ''}Material Request Pending Approval`, `${matReq.requestedBy.fullName} requested ${requestedQuantity} ${resolvedUnit} of ${resolvedItemName} [${resolvedUrgency.toUpperCase()}] for WO ${wo.woNumber}`, 'repair_material_request', matReq.id, 'maintenance-work-orders');
    }
    if (wo.plannerId && wo.plannerId !== wo.assignedSupervisorId) {
      await notifyUser(wo.plannerId, 'repair_material_request', 'New Material Request Submitted', `${matReq.requestedBy.fullName} requested ${requestedQuantity} ${resolvedUnit} of ${resolvedItemName} [${resolvedUrgency.toUpperCase()}] for WO ${wo.woNumber}`, 'repair_material_request', matReq.id, 'maintenance-work-orders');
    }

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'repair_material_request',
        entityId: matReq.id,
        newValues: JSON.stringify({
          workOrderId,
          itemId: itemId || null,
          itemName: resolvedItemName,
          quantityRequested: requestedQuantity,
          unitCost: resolvedUnitCost,
          urgency: resolvedUrgency,
          reason: resolvedReason,
          plantId: wo.plantId,
        }),
      },
    });

    const responseData = { ...matReq, currentStock };
    if (stockWarning) return NextResponse.json({ success: true, data: responseData, warning: stockWarning }, { status: 201 });
    return NextResponse.json({ success: true, data: responseData }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create material request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
