import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { canViewWorkOrder } from '@/services/workOrderAccess.service';

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
    const { componentId, parameterKey, value, unit, acceptableMin, acceptableMax } = body;

    if (!parameterKey || typeof parameterKey !== 'string') {
      return NextResponse.json({ success: false, error: 'parameterKey is required' }, { status: 400 });
    }
    if (value === undefined || value === null || typeof value !== 'number') {
      return NextResponse.json({ success: false, error: 'value is required and must be a number' }, { status: 400 });
    }
    if (!unit || typeof unit !== 'string') {
      return NextResponse.json({ success: false, error: 'unit is required' }, { status: 400 });
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        isLocked: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        teamMembers: { select: { userId: true, accessLevel: true } },
        workOrderComponents: { select: { componentRegistryId: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const isAssignedTechnician = wo.assignedTo === session.userId || wo.teamLeaderId === session.userId;
    const isExecutionTeamMember = wo.teamMembers.some(
      (member) => member.userId === session.userId && member.accessLevel !== 'read_only',
    );
    const hasExecutionPermission =
      hasPermission(session, 'work_orders.update') ||
      hasPermission(session, 'work_orders.start') ||
      hasPermission(session, 'work_orders.complete');

    if (!isAdmin(session) && (!(isAssignedTechnician || isExecutionTeamMember) || !hasExecutionPermission)) {
      return NextResponse.json(
        { success: false, error: 'Only an assigned execution actor can record measurements for this work order' },
        { status: 403 },
      );
    }

    if (wo.isLocked) {
      return NextResponse.json({ success: false, error: 'Work order is locked and cannot be modified' }, { status: 409 });
    }
    if (wo.status === 'closed') {
      return NextResponse.json({ success: false, error: 'Work order is closed and cannot be modified' }, { status: 409 });
    }

    let resolvedComponentId = componentId;
    if (!resolvedComponentId) {
      if (wo.workOrderComponents.length > 0) {
        resolvedComponentId = wo.workOrderComponents[0].componentRegistryId;
      } else {
        return NextResponse.json(
          { success: false, error: 'No components linked to this work order. Provide a componentId.' },
          { status: 400 },
        );
      }
    } else {
      const match = wo.workOrderComponents.find((component) => component.componentRegistryId === resolvedComponentId);
      if (!match) {
        return NextResponse.json(
          { success: false, error: 'componentId does not belong to this work order' },
          { status: 400 },
        );
      }
    }

    let isAlarm = false;
    const minThreshold = acceptableMin ?? null;
    const maxThreshold = acceptableMax ?? null;
    if (minThreshold !== null && value < minThreshold) isAlarm = true;
    if (maxThreshold !== null && value > maxThreshold) isAlarm = true;

    const reading = await db.componentConditionReading.create({
      data: {
        componentId: resolvedComponentId,
        parameterKey,
        value,
        unit,
        quality: 100,
        minThreshold,
        maxThreshold,
        isAlarm,
        source: 'manual',
        recordedById: session.userId,
      },
      include: {
        recordedBy: { select: { id: true, fullName: true, username: true } },
        component: { select: { id: true, name: true, componentCode: true } },
      },
    });

    return NextResponse.json({ success: true, data: reading }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record measurement';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

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
    const { searchParams } = new URL(request.url);
    const componentIdFilter = searchParams.get('componentId') || undefined;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        maintenanceRequest: { select: { requestedBy: true } },
        teamMembers: { select: { userId: true } },
        workOrderComponents: { select: { componentRegistryId: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json({ success: false, error: 'Access denied — you are not part of this work order workflow' }, { status: 403 });
    }

    const componentIds = wo.workOrderComponents.map((component) => component.componentRegistryId);
    if (componentIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    if (componentIdFilter && !componentIds.includes(componentIdFilter)) {
      return NextResponse.json({ success: false, error: 'componentId does not belong to this work order' }, { status: 400 });
    }

    const readings = await db.componentConditionReading.findMany({
      where: {
        componentId: componentIdFilter || { in: componentIds },
      },
      orderBy: { recordedAt: 'desc' },
      include: {
        recordedBy: { select: { id: true, fullName: true, username: true } },
        component: { select: { id: true, name: true, componentCode: true } },
      },
      take: 200,
    });

    return NextResponse.json({ success: true, data: readings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch measurements';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
