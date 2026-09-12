import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder, canViewWorkOrder } from '@/services/workOrderAccess.service';

// GET /api/work-orders/[id]/components — Get components linked to a WO
export async function GET(
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

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        maintenanceRequest: { select: { requestedBy: true } },
        teamMembers: { select: { userId: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json({ success: false, error: 'Access denied — you are not part of this work order workflow' }, { status: 403 });
    }

    const components = await db.workOrderComponent.findMany({
      where: { workOrderId: id },
      include: {
        componentRegistry: {
          include: {
            asset: { select: { id: true, name: true } },
            sparePartLinks: {
              include: {
                inventoryItem: { select: { id: true, itemCode: true, name: true, currentStock: true, unitCost: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: components });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work order components';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/work-orders/[id]/components — Set/replace components for a WO
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'work_orders.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const body = await request.json();
    const { componentIds, notes } = body as { componentIds?: string[]; notes?: Record<string, string> };

    if (!componentIds || !Array.isArray(componentIds)) {
      return NextResponse.json({ success: false, error: 'componentIds array is required' }, { status: 400 });
    }
    if (componentIds.some((componentId) => typeof componentId !== 'string' || !componentId.trim())) {
      return NextResponse.json({ success: false, error: 'componentIds must contain valid component IDs' }, { status: 400 });
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        assetId: true,
        isLocked: true,
        status: true,
        assignedSupervisorId: true,
        plannerId: true,
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (!canManageWorkOrder(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Only the assigned supervisor/planner or maintenance management can change work-order component links' },
        { status: 403 },
      );
    }

    if (wo.isLocked || wo.status === 'closed' || wo.status === 'verified') {
      return NextResponse.json(
        { success: false, error: `Work order components cannot be changed while status is ${wo.status}` },
        { status: 409 },
      );
    }

    const uniqueComponentIds = Array.from(new Set(componentIds));
    if (uniqueComponentIds.length > 0) {
      if (!wo.assetId) {
        return NextResponse.json(
          { success: false, error: 'Cannot link components to a work order without an asset' },
          { status: 400 },
        );
      }

      const components = await db.componentRegistry.findMany({
        where: { id: { in: uniqueComponentIds } },
        select: { id: true, assetId: true, name: true, componentCode: true },
      });
      if (components.length !== uniqueComponentIds.length) {
        const foundIds = new Set(components.map((component) => component.id));
        const missingIds = uniqueComponentIds.filter((componentId) => !foundIds.has(componentId));
        return NextResponse.json(
          { success: false, error: `Unknown component IDs: ${missingIds.join(', ')}` },
          { status: 400 },
        );
      }

      const wrongAsset = components.find((component) => component.assetId !== wo.assetId);
      if (wrongAsset) {
        return NextResponse.json(
          {
            success: false,
            error: `Component ${wrongAsset.componentCode || wrongAsset.name} does not belong to the work order asset`,
          },
          { status: 400 },
        );
      }
    }

    const previous = await db.workOrderComponent.findMany({
      where: { workOrderId: id },
      select: { componentRegistryId: true },
    });

    await db.$transaction(async (tx) => {
      await tx.workOrderComponent.deleteMany({ where: { workOrderId: id } });

      if (uniqueComponentIds.length > 0) {
        await tx.workOrderComponent.createMany({
          data: uniqueComponentIds.map((componentId) => ({
            workOrderId: id,
            componentRegistryId: componentId,
            notes: notes?.[componentId] || null,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'work_order_components',
          entityId: id,
          oldValues: JSON.stringify({ componentIds: previous.map((row) => row.componentRegistryId) }),
          newValues: JSON.stringify({ componentIds: uniqueComponentIds }),
        },
      });
    });

    const components = await db.workOrderComponent.findMany({
      where: { workOrderId: id },
      include: {
        componentRegistry: {
          include: {
            asset: { select: { id: true, name: true } },
            sparePartLinks: {
              include: {
                inventoryItem: { select: { id: true, itemCode: true, name: true, currentStock: true, unitCost: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: components });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update work order components';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
