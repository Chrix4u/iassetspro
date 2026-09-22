import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder, canViewWorkOrder } from '@/services/workOrderAccess.service';

function parsePersonalTools(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[personal-tools] Failed to parse personalTools JSON:', error);
    return [];
  }
}

/** GET /api/work-orders/[id]/personal-tools */
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

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        personalTools: true,
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
      return NextResponse.json({ success: false, error: 'Access denied — you are not part of this work order workflow' }, { status: 403 });
    }

    const isExecutionMember =
      wo.assignedTo === session.userId
      || wo.teamLeaderId === session.userId
      || wo.teamMembers.some((member) => member.userId === session.userId);

    // Exact WO assignment is relationship-scoped and does not grant plant-wide
    // access. It also preserves legacy assignments that predate UserPlant rows.
    if (!isExecutionMember) {
      const plantAuth = await authorizeWorkOrderPlant(request, session, id);
      if (!plantAuth.ok) return plantAuth.response;
    }

    return NextResponse.json({ success: true, data: parsePersonalTools(wo.personalTools) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch personal tools';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** POST /api/work-orders/[id]/personal-tools — add one personal tool record */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const body = await request.json();
    const toolName = typeof body.toolName === 'string' ? body.toolName.trim() : '';
    if (!toolName) {
      return NextResponse.json({ success: false, error: 'toolName is required' }, { status: 400 });
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        personalTools: true,
        isLocked: true,
        status: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true, role: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (wo.isLocked) {
      return NextResponse.json({ success: false, error: 'Work order is permanently locked.' }, { status: 400 });
    }
    if (wo.status === 'verified' || wo.status === 'closed') {
      return NextResponse.json({ success: false, error: `Work order has been reviewed. Changes are no longer allowed. Status: ${wo.status}` }, { status: 400 });
    }

    const isExecutionMember =
      wo.assignedTo === session.userId ||
      wo.teamLeaderId === session.userId ||
      wo.teamMembers.some((member) => member.userId === session.userId);
    const canManage =
      (isAdmin(session) || hasAnyPermission(session, ['work_orders.update'])) &&
      canManageWorkOrder(session, wo);

    if (!isExecutionMember) {
      const plantAuth = await authorizeWorkOrderPlant(request, session, id);
      if (!plantAuth.ok) return plantAuth.response;
    }

    if (!isExecutionMember && !canManage) {
      return NextResponse.json({ success: false, error: 'Only assigned execution staff or accountable maintenance management can add personal tools.' }, { status: 403 });
    }

    const existingTools = parsePersonalTools(wo.personalTools) as Array<Record<string, unknown>>;
    const newTool = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      toolName,
      toolCode: typeof body.toolCode === 'string' && body.toolCode.trim() ? body.toolCode.trim() : null,
      condition: typeof body.condition === 'string' && body.condition.trim() ? body.condition.trim() : 'good',
      notes: typeof body.notes === 'string' ? body.notes.trim() : '',
      addedBy: session.userId,
      addedAt: new Date().toISOString(),
    };

    existingTools.push(newTool);
    await db.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id },
        data: { personalTools: JSON.stringify(existingTools) },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'work_order',
          entityId: id,
          oldValues: JSON.stringify({ personalTools: wo.personalTools }),
          newValues: JSON.stringify({ personalTools: existingTools, personalToolAdded: newTool.id }),
        },
      });
    });

    return NextResponse.json({ success: true, data: newTool }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add personal tool';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** PUT /api/work-orders/[id]/personal-tools — replace personal tool list */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const body = await request.json();
    const tools = body.tools;
    if (!Array.isArray(tools)) {
      return NextResponse.json({ success: false, error: 'tools array is required' }, { status: 400 });
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        personalTools: true,
        isLocked: true,
        status: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamLeaderId: true,
        teamMembers: { select: { userId: true, role: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (wo.isLocked) {
      return NextResponse.json({ success: false, error: 'Work order is permanently locked. No modifications are allowed after planner closure.' }, { status: 400 });
    }
    if (wo.status === 'verified' || wo.status === 'closed') {
      return NextResponse.json({ success: false, error: `Work order has been reviewed. Changes are no longer allowed. Status: ${wo.status}` }, { status: 400 });
    }

    const isTeamLeader =
      wo.teamLeaderId === session.userId ||
      wo.teamMembers.some((member) => member.userId === session.userId && member.role === 'team_leader');
    const canManage =
      (isAdmin(session) || hasAnyPermission(session, ['work_orders.update'])) &&
      canManageWorkOrder(session, wo);

    if (!isTeamLeader) {
      const plantAuth = await authorizeWorkOrderPlant(request, session, id);
      if (!plantAuth.ok) return plantAuth.response;
    }

    if (!canManage && !isTeamLeader) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions. Requires team-leader or accountable maintenance-management authority.' }, { status: 403 });
    }

    const previousTools = parsePersonalTools(wo.personalTools) as Array<Record<string, unknown>>;
    const previousById = new Map(
      previousTools
        .filter((tool) => typeof tool.id === 'string')
        .map((tool) => [tool.id as string, tool]),
    );
    const now = new Date().toISOString();
    const normalizedTools: Array<Record<string, unknown>> = [];

    for (const tool of tools) {
      if (!tool || typeof tool !== 'object') {
        return NextResponse.json({ success: false, error: 'Each tool must be an object' }, { status: 400 });
      }
      const source = tool as Record<string, unknown>;
      const toolName = typeof source.toolName === 'string' ? source.toolName.trim() : '';
      if (!toolName) {
        return NextResponse.json({ success: false, error: 'Each tool must have a toolName' }, { status: 400 });
      }

      const requestedId = typeof source.id === 'string' && source.id ? source.id : null;
      const previous = requestedId ? previousById.get(requestedId) : undefined;
      normalizedTools.push({
        id: previous?.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        toolName,
        toolCode: typeof source.toolCode === 'string' && source.toolCode.trim() ? source.toolCode.trim() : null,
        condition: typeof source.condition === 'string' && source.condition.trim() ? source.condition.trim() : 'good',
        notes: typeof source.notes === 'string' ? source.notes.trim() : '',
        addedBy: previous?.addedBy || session.userId,
        addedAt: previous?.addedAt || now,
      });
    }

    const newValues = JSON.stringify(normalizedTools);
    const updated = await db.$transaction(async (tx) => {
      const updatedWO = await tx.workOrder.update({
        where: { id },
        data: { personalTools: newValues },
        include: {
          assignee: { select: { id: true, fullName: true, username: true } },
          teamLeader: { select: { id: true, fullName: true, username: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'work_order',
          entityId: id,
          oldValues: JSON.stringify({ personalTools: wo.personalTools }),
          newValues: JSON.stringify({ personalTools: normalizedTools }),
        },
      });
      return updatedWO;
    });

    return NextResponse.json({ success: true, data: normalizedTools, workOrder: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update personal tools';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
