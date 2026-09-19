import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 50;

// GET /api/repairs/material-catalog?workOrderId=...&search=...
// Purpose-built execution catalog: lets an assigned WO technician select
// available materials without granting access to the Inventory module.
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'repair_material_requests.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workOrderId = searchParams.get('workOrderId');
    const search = (searchParams.get('search') || '').trim();
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50));

    if (!workOrderId) {
      return NextResponse.json({ success: false, error: 'workOrderId is required' }, { status: 400 });
    }

    const workOrder = await db.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        teamMembers: { select: { userId: true } },
      },
    });
    if (!workOrder) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (!workOrder.plantId) {
      return NextResponse.json({ success: false, error: 'Operational work order must have a plant' }, { status: 400 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, workOrder.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const isExecutionActor =
      workOrder.assignedTo === session.userId ||
      workOrder.teamLeaderId === session.userId ||
      workOrder.teamMembers.some(member => member.userId === session.userId);

    if (!isAdmin(session) && !isExecutionActor) {
      return NextResponse.json({
        success: false,
        error: 'Material catalog is available only to the assigned work-order execution team',
      }, { status: 403 });
    }

    const items = await db.inventoryItem.findMany({
      where: {
        plantId: workOrder.plantId,
        isActive: true,
        currentStock: { gt: 0 },
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { itemCode: { contains: search } },
                { category: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        itemCode: true,
        name: true,
        category: true,
        currentStock: true,
        unitOfMeasure: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load material catalog';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
