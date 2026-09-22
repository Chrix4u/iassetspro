import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canViewWorkOrder } from '@/services/workOrderAccess.service';

function parseSuggestedTools(value: string | null | undefined): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/work-orders/[id]/tool-options
 *
 * Relationship-scoped tool lookup for execution users. This deliberately avoids
 * exposing the full Tool Registry workspace to technicians while still giving
 * them the exact plant tools they are allowed to request for this WO.
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
    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Access denied — you are not part of this work order workflow' },
        { status: 403 },
      );
    }
    if (!isAdmin(session) && !hasPermission(session, 'repair_tool_requests.create')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permission to request tools for this work order' },
        { status: 403 },
      );
    }
    if (!wo.plantId) {
      return NextResponse.json(
        { success: false, error: 'Operational work order must have a plant' },
        { status: 400 },
      );
    }

    const recommendations = parseSuggestedTools(wo.suggestedTools);
    const recommendedIds = new Set(
      recommendations
        .map((row) => typeof row.toolId === 'string' ? row.toolId : '')
        .filter(Boolean),
    );

    const [availableTools, recommendedTools] = await Promise.all([
      db.tool.findMany({
        where: {
          isActive: true,
          plantId: wo.plantId,
          status: 'available',
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
          plantId: true,
        },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      recommendedIds.size > 0
        ? db.tool.findMany({
            where: {
              id: { in: [...recommendedIds] },
              isActive: true,
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
              plantId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const byId = new Map<string, any>();
    for (const tool of availableTools) {
      byId.set(tool.id, {
        ...tool,
        recommended: recommendedIds.has(tool.id),
        requestable: Number(tool.quantity ?? 1) > 0,
      });
    }
    for (const tool of recommendedTools) {
      if (byId.has(tool.id)) continue;
      byId.set(tool.id, {
        ...tool,
        recommended: true,
        requestable: tool.status === 'available' && Number(tool.quantity ?? 1) > 0,
      });
    }

    const data = [...byId.values()].sort((a, b) => {
      if (Boolean(a.recommended) !== Boolean(b.recommended)) return a.recommended ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return NextResponse.json({
      success: true,
      data,
      meta: {
        workOrderId: id,
        plantId: wo.plantId,
        recommendedToolIds: [...recommendedIds],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work-order tool options';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
