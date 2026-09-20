import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'repair_material_requests.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workOrderId = searchParams.get('workOrderId');
    const search = searchParams.get('search')?.trim();
    if (!workOrderId) {
      return NextResponse.json({ success: false, error: 'workOrderId is required' }, { status: 400 });
    }

    const wo = await db.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        teamMembers: { select: { userId: true } },
      },
    });
    if (!wo) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    if (!wo.plantId) return NextResponse.json({ success: false, error: 'Work order has no plant' }, { status: 400 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const executionActor =
      wo.assignedTo === session.userId ||
      wo.teamLeaderId === session.userId ||
      wo.teamMembers.some(member => member.userId === session.userId);
    if (!executionActor && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'You are not a member of this work order execution team' }, { status: 403 });
    }

    const items = await db.inventoryItem.findMany({
      where: {
        plantId: wo.plantId,
        isActive: true,
        ...(search ? {
          OR: [
            { name: { contains: search } },
            { itemCode: { contains: search } },
          ],
        } : {}),
      },
      select: {
        id: true,
        itemCode: true,
        name: true,
        category: true,
        unitOfMeasure: true,
        currentStock: true,
      },
      orderBy: { name: 'asc' },
      take: 100,
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load repair material catalog';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
