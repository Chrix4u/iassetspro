import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canViewWorkOrder } from '@/services/workOrderAccess.service';

/**
 * GET /api/work-orders/[id]/tool-options
 *
 * WO-scoped tool selector for execution users. This intentionally does not
 * expose the global Tool Registry workspace. The exact WO relationship is the
 * authority boundary and the query is hard-filtered to the WO plant.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true, role: true } },
        maintenanceRequest: { select: { requestedBy: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (!wo.plantId) {
      return NextResponse.json(
        { success: false, error: 'Operational work order must have a plant' },
        { status: 400 },
      );
    }

    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Access denied — you are not part of this work order workflow' },
        { status: 403 },
      );
    }

    const isExecutionActor =
      wo.assignedTo === session.userId
      || wo.teamLeaderId === session.userId
      || wo.teamMembers.some((member) => member.userId === session.userId);

    const canRequestTools =
      isAdmin(session) || hasPermission(session, 'repair_tool_requests.create');

    if (!isExecutionActor && !isAdmin(session)) {
      return NextResponse.json(
        { success: false, error: 'Only assigned execution staff can browse work-order tool options' },
        { status: 403 },
      );
    }
    if (!canRequestTools) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permission to request tools' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const requestedStatus = searchParams.get('status')?.trim() || '';
    const limitRaw = Number(searchParams.get('limit') || 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.trunc(limitRaw))) : 100;

    const tools = await db.tool.findMany({
      where: {
        isActive: true,
        plantId: wo.plantId,
        ...(requestedStatus ? { status: requestedStatus } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { toolCode: { contains: search } },
                { serialNumber: { contains: search } },
                { category: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        toolCode: true,
        name: true,
        category: true,
        status: true,
        condition: true,
        quantity: true,
        assignedToId: true,
        plantId: true,
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: tools,
      meta: { workOrderId: wo.id, plantId: wo.plantId, count: tools.length },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work-order tool options';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
