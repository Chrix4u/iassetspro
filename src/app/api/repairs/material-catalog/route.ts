import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workOrderId = searchParams.get('workOrderId');
    const search = (searchParams.get('search') || '').trim();

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
      return NextResponse.json({ success: false, error: 'Work order has no plant' }, { status: 400 });
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
        error: 'Only the assigned technician or work-order team can browse materials for this work order',
      }, { status: 403 });
    }

    const where: Record<string, unknown> = {
      isActive: true,
      plantId: workOrder.plantId,
    };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { itemCode: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const items = await db.inventoryItem.findMany({
      where,
      select: {
        id: true,
        itemCode: true,
        name: true,
        category: true,
        currentStock: true,
        unitOfMeasure: true,
      },
      orderBy: { name: 'asc' },
      take: 200,
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load material catalog';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
