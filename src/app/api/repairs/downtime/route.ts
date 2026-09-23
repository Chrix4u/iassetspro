import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasRole, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, applyPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { Prisma } from '@prisma/client';
import { canViewWorkOrder, hasWorkOrderViewOverride } from '@/services/workOrderAccess.service';

// GET /api/repairs/downtime
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['downtime.view', 'work_orders.view', 'work_orders.view_own']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workOrderId = searchParams.get('workOrderId');
    const assetId = searchParams.get('assetId');
    const category = searchParams.get('category');
    const impactLevel = searchParams.get('impactLevel');
    const status = searchParams.get('status'); // 'ongoing' (no endTime) | 'completed'
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const where: Record<string, unknown> = {};

    // Apply plant scope filter
    const plantScope = await getPlantScope(request, session);
    if (plantScope) {
      applyPlantScope(where, plantScope);
    }
    if (workOrderId) where.workOrderId = workOrderId;
    if (assetId) where.assetId = assetId;
    if (category) where.category = category;
    if (impactLevel) where.impactLevel = impactLevel;
    if (status === 'ongoing') where.downtimeEnd = null;
    if (status === 'completed') where.downtimeEnd = { not: null };

    if (search) {
      where.OR = [
        { assetName: { contains: search, mode: Prisma.QueryMode.insensitive } },
        { workOrder: { woNumber: { contains: search, mode: Prisma.QueryMode.insensitive } } },
      ];
    }

    // Keep downtime visibility aligned with canonical work-order relationship scope.
    // Basic work_orders.view is not a global grant; only explicit view-all/admin/
    // management override may bypass relationship scoping.
    if (!hasWorkOrderViewOverride(session)) {
      const relationshipScope = {
        OR: [
          { assignedTo: session.userId },
          { teamLeaderId: session.userId },
          { assignedSupervisorId: session.userId },
          { plannerId: session.userId },
          { teamMembers: { some: { userId: session.userId } } },
          { maintenanceRequest: { requestedBy: session.userId } },
        ],
      };
      where.workOrder = relationshipScope;
    }

    const [records, total] = await Promise.all([
      db.workOrderDowntime.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.workOrderDowntime.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    return NextResponse.json({ success: true, data: records, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load downtime records';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/repairs/downtime
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const canCreate = isAdmin(session) || hasRole(session, 'maintenance_technician') || hasRole(session, 'maintenance_supervisor') || hasRole(session, 'maintenance_planner') || hasRole(session, 'maintenance_manager') || hasRole(session, 'production_operator') || hasRole(session, 'production_manager');
    if (!canCreate) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to create downtime records' }, { status: 403 });
    }

    const body = await request.json();
    const { workOrderId, assetId, assetName, downtimeStart, downtimeEnd, reason, category, impactLevel, productionLoss, notes } = body;

    if (!workOrderId || !reason) {
      return NextResponse.json({ success: false, error: 'workOrderId and reason are required' }, { status: 400 });
    }

    const wo = await db.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        teamMembers: { select: { userId: true, role: true, accessLevel: true } },
        maintenanceRequest: { select: { requestedBy: true } },
      },
    });
    if (!wo) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json({ success: false, error: 'Access denied — this work order is outside your workflow scope' }, { status: 403 });
    }

    // Resolve asset info: prefer body values, fall back to WO's asset
    const resolvedAssetId = assetId || wo.assetId || null;
    const resolvedAssetName = assetName || (await db.asset.findUnique({ where: { id: resolvedAssetId || '' }, select: { name: true } }))?.name || wo.assetName || null;

    const start = downtimeStart ? new Date(downtimeStart) : new Date();
    const end = downtimeEnd ? new Date(downtimeEnd) : null;
    const durationMinutes = body.durationMinutes ? parseFloat(body.durationMinutes) : (end ? Math.max(0, (end.getTime() - start.getTime()) / 60000) : 0);

    const record = await db.workOrderDowntime.create({
      data: {
        workOrderId, assetId: resolvedAssetId, assetName: resolvedAssetName,
        downtimeStart: start, downtimeEnd: end, durationMinutes,
        reason, category: category || 'unplanned', impactLevel: impactLevel || 'medium',
        productionLoss: productionLoss || null, notes: notes || null,
        createdById: session.userId,
      },
      include: { workOrder: { select: { id: true, woNumber: true, title: true } } },
    });

    await db.auditLog.create({
      data: { userId: session.userId, action: 'create', entityType: 'wo_downtime', entityId: record.id, newValues: JSON.stringify({ workOrderId, assetName, durationMinutes, category }) },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create downtime record';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
