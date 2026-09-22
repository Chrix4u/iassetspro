import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder, canViewWorkOrder } from '@/services/workOrderAccess.service';

function parseSuggestedTools(value: string | null | undefined): Array<Record<string, unknown>> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/work-orders/[id]/tool-options
 *
 * Least-privilege technician lookup. Unlike the global /api/tools registry,
 * this endpoint is authorized through the exact work order and only returns
 * active tool selector data from that WO's plant.
 */
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
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        plantId: true,
        suggestedTools: true,
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

    if (!isExecutionActor && !canManageWorkOrder(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Only assigned execution staff or accountable maintenance management can load work-order tool options' },
        { status: 403 },
      );
    }

    const recommendations = parseSuggestedTools(wo.suggestedTools);
    const recommendedIds = Array.from(new Set(
      recommendations
        .map((item) => typeof item.toolId === 'string' ? item.toolId : '')
        .filter(Boolean),
    ));

    const [availableTools, recommendedRecords] = await Promise.all([
      db.tool.findMany({
        where: {
          isActive: true,
          plantId: wo.plantId,
          status: 'available',
          quantity: { gt: 0 },
        },
        select: {
          id: true,
          toolCode: true,
          name: true,
          category: true,
          status: true,
          condition: true,
          quantity: true,
          location: true,
          assignedToId: true,
          plantId: true,
        },
        orderBy: [{ name: 'asc' }, { toolCode: 'asc' }],
        take: 200,
      }),
      recommendedIds.length > 0
        ? db.tool.findMany({
            where: {
              id: { in: recommendedIds },
              plantId: wo.plantId,
            },
            select: {
              id: true,
              toolCode: true,
              name: true,
              category: true,
              status: true,
              condition: true,
              quantity: true,
              location: true,
              assignedToId: true,
              plantId: true,
              isActive: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const recommendedById = new Map(recommendedRecords.map((tool) => [tool.id, tool]));
    const recommendedTools = recommendations
      .filter((item) => typeof item.toolId === 'string' && item.toolId)
      .map((item) => {
        const toolId = item.toolId as string;
        const current = recommendedById.get(toolId);
        return {
          ...item,
          toolId,
          toolName: typeof item.toolName === 'string' && item.toolName
            ? item.toolName
            : current?.name || 'Planner-recommended tool',
          toolCode: typeof item.toolCode === 'string' && item.toolCode
            ? item.toolCode
            : current?.toolCode || '',
          currentStatus: current?.status || 'unavailable',
          currentCondition: current?.condition || null,
          currentQuantity: current?.quantity ?? 0,
          location: current?.location || null,
          active: current?.isActive ?? false,
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        availableTools,
        recommendedTools,
        plantId: wo.plantId,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work-order tool options';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
