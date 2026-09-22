import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderExecutionAccess } from '@/lib/plant-auth-helpers';
import {
  canManageWorkOrder,
  isWorkOrderExecutionMember,
} from '@/services/workOrderAccess.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const access = await authorizeWorkOrderExecutionAccess(request, session, id);
    if (!access.ok) return access.response;

    const wo = access.entity;
    const isExecutionActor = isWorkOrderExecutionMember(session, wo);
    const isAccountableManagement = isAdmin(session) || (
      hasPermission(session, 'work_orders.update') && canManageWorkOrder(session, wo)
    );

    if (!isExecutionActor && !isAccountableManagement) {
      return NextResponse.json(
        { success: false, error: 'Access denied — you are not part of this work order workflow' },
        { status: 403 },
      );
    }

    if (!isAdmin(session) && !hasPermission(session, 'repair_material_requests.create')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permission to request materials' },
        { status: 403 },
      );
    }

    if (!wo.plantId) {
      return NextResponse.json(
        { success: false, error: 'Operational work order has no plant' },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 200);

    const items = await db.inventoryItem.findMany({
      where: {
        isActive: true,
        plantId: wo.plantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { itemCode: { contains: search } },
                { description: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        itemCode: true,
        name: true,
        currentStock: true,
        minStockLevel: true,
        unitOfMeasure: true,
        plantId: true,
        location: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: items,
      meta: {
        workOrderId: id,
        plantId: wo.plantId,
        relationshipScoped: isExecutionActor,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work-order inventory candidates';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
