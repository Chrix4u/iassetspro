import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission } from '@/lib/auth';
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
        repairToolRequests: {
          where: { source: 'planner_suggested', status: 'pending' },
          select: {
            id: true,
            toolId: true,
            toolName: true,
            items: {
              select: {
                toolId: true,
                toolName: true,
                toolCode: true,
                quantityRequested: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
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
      isExecutionActor && hasPermission(session, 'repair_tool_requests.create');

    // Exact WO execution membership is already a narrower scope than general
    // plant browsing. Do not require a separate UserPlant row for technicians
    // assigned to this specific work order. Management/non-execution actors
    // still require the normal plant authorization boundary.
    if (!isExecutionActor) {
      const plantAuth = await authorizeWorkOrderPlant(request, session, id);
      if (!plantAuth.ok) return plantAuth.response;
    }

    if (!canRequestTools && !canManageWorkOrder(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Tool options require assigned execution access with tool-request permission, or accountable maintenance-management authority' },
        { status: 403 },
      );
    }

    // Prefer the durable planner snapshot, but recover older conversions that
    // only persisted a pending planner_suggested request/header/item row.
    const recommendationByToolId = new Map<string, Record<string, unknown>>();
    for (const item of parseSuggestedTools(wo.suggestedTools)) {
      const toolId = typeof item.toolId === 'string' ? item.toolId : '';
      if (toolId) recommendationByToolId.set(toolId, item);
    }
    for (const request of wo.repairToolRequests) {
      const requestItems = request.items.length > 0
        ? request.items
        : request.toolId
          ? [{
              toolId: request.toolId,
              toolName: request.toolName,
              toolCode: null,
              quantityRequested: 1,
            }]
          : [];

      for (const item of requestItems) {
        if (!item.toolId || recommendationByToolId.has(item.toolId)) continue;
        recommendationByToolId.set(item.toolId, {
          id: `legacy-planner:${request.id}:${item.toolId}`,
          toolId: item.toolId,
          toolName: item.toolName || request.toolName || 'Planner-recommended tool',
          toolCode: item.toolCode || '',
          quantity: item.quantityRequested || 1,
          notes: 'Recovered from planner recommendation',
        });
      }
    }

    const recommendations = [...recommendationByToolId.values()];
    const recommendedIds = [...recommendationByToolId.keys()];

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

    const recommendedById = new Map<string, (typeof recommendedRecords)[number]>(
      recommendedRecords.map((tool) => [tool.id, tool] as const),
    );
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
