import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

/**
 * GET /api/repairs/material-catalog?workOrderId=...
 *
 * Narrow operational catalog for the repair execution team. This deliberately
 * does NOT grant Inventory-module access or expose cost, supplier, location or
 * procurement metadata. It exists only so an authorized technician can select
 * a real inventory-backed material when creating a repair material request.
 */
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
    const search = searchParams.get('search')?.trim() || '';

    if (!workOrderId) {
      return NextResponse.json({ success: false, error: 'workOrderId is required' }, { status: 400 });
    }

    const workOrder = await db.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, plantId: true, assignedTo: true },
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

    const teamMembership = await db.workOrderTeamMember.findFirst({
      where: { workOrderId, userId: session.userId },
      select: { id: true },
    });
    const isExecutionActor = workOrder.assignedTo === session.userId || !!teamMembership;
    if (!isAdmin(session) && !isExecutionActor) {
      return NextResponse.json(
        { success: false, error: 'Only the assigned work-order execution team can browse materials for this request' },
        { status: 403 },
      );
    }

    const where: Record<string, unknown> = {
      isActive: true,
      plantId: workOrder.plantId,
    };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { itemCode: { contains: search } },
      ];
    }

    const items = await db.inventoryItem.findMany({
      where,
      select: {
        id: true,
        itemCode: true,
        name: true,
        currentStock: true,
        unitOfMeasure: true,
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
