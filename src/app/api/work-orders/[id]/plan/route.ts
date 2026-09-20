import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission } from '@/lib/auth';
import { executeTransition } from '@/lib/state-machine';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canPlanWorkOrderForActor } from '@/services/workOrderAccess.service';

/**
 * POST /api/work-orders/[id]/plan
 *
 * Plans a work order (approved → planned).
 * Planner assigns resources and scheduling. Department/supervisor references
 * are validated against the WO plant before the state transition is attempted.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasAnyPermission(session, ['work_orders.update'])) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to plan work order' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const woPlantId = plantAuth.entity.plantId;
    if (!woPlantId) {
      return NextResponse.json({ success: false, error: 'Operational work order must have a plant' }, { status: 400 });
    }

    const body = await request.json();
    const {
      notes,
      estimatedHours,
      plannedStart,
      plannedEnd,
      departmentId,
      assignedSupervisorId,
    } = body;

    const wo = await db.workOrder.findUnique({ where: { id } });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (!canPlanWorkOrderForActor(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Only the accountable planner or authorized maintenance management can plan this work order' },
        { status: 403 },
      );
    }

    if (estimatedHours !== undefined) {
      const parsedHours = Number(estimatedHours);
      if (!Number.isFinite(parsedHours) || parsedHours < 0) {
        return NextResponse.json({ success: false, error: 'estimatedHours must be a non-negative number' }, { status: 400 });
      }
    }

    if (departmentId) {
      const department = await db.department.findUnique({
        where: { id: departmentId },
        select: { id: true, plantId: true },
      });
      if (!department) {
        return NextResponse.json({ success: false, error: 'Selected department not found' }, { status: 400 });
      }
      if (department.plantId !== woPlantId) {
        return NextResponse.json({ success: false, error: 'Selected department belongs to a different plant' }, { status: 400 });
      }
    }

    if (assignedSupervisorId) {
      const supervisor = await db.user.findUnique({
        where: { id: assignedSupervisorId },
        select: {
          id: true,
          status: true,
          plantAccess: { where: { plantId: woPlantId }, select: { id: true } },
          userRoles: { select: { role: { select: { slug: true } } } },
        },
      });
      if (!supervisor || supervisor.status !== 'active') {
        return NextResponse.json({ success: false, error: 'Selected supervisor is not active' }, { status: 400 });
      }
      if (supervisor.plantAccess.length === 0) {
        return NextResponse.json({ success: false, error: 'Selected supervisor does not have access to the work order plant' }, { status: 400 });
      }
      const supervisorRoles = new Set(supervisor.userRoles.map((userRole) => userRole.role.slug));
      if (![...supervisorRoles].some((slug) => ['maintenance_supervisor', 'maintenance_manager', 'plant_manager', 'admin'].includes(slug))) {
        return NextResponse.json({ success: false, error: 'Selected user is not a maintenance supervisor or manager' }, { status: 400 });
      }
    }

    const parsedPlannedStart = plannedStart ? new Date(plannedStart) : wo.plannedStart;
    const parsedPlannedEnd = plannedEnd ? new Date(plannedEnd) : wo.plannedEnd;
    if (parsedPlannedStart && Number.isNaN(parsedPlannedStart.getTime())) {
      return NextResponse.json({ success: false, error: 'plannedStart is not a valid date' }, { status: 400 });
    }
    if (parsedPlannedEnd && Number.isNaN(parsedPlannedEnd.getTime())) {
      return NextResponse.json({ success: false, error: 'plannedEnd is not a valid date' }, { status: 400 });
    }
    if (parsedPlannedStart && parsedPlannedEnd && parsedPlannedEnd < parsedPlannedStart) {
      return NextResponse.json({ success: false, error: 'plannedEnd cannot be earlier than plannedStart' }, { status: 400 });
    }

    const result = await executeTransition(
      'work_order',
      id,
      'planned',
      session,
      {
        reason: notes,
        extraData: {
          plannerId: session.userId,
          estimatedHours: estimatedHours !== undefined ? Number(estimatedHours) : wo.estimatedHours,
          plannedStart: parsedPlannedStart,
          plannedEnd: parsedPlannedEnd,
          departmentId: departmentId ?? wo.departmentId,
          assignedSupervisorId: assignedSupervisorId ?? wo.assignedSupervisorId,
        },
      },
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    const updated = await db.workOrder.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, username: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        assignedSupervisor: { select: { id: true, fullName: true, username: true } },
        planner: { select: { id: true, fullName: true, username: true } },
        maintenanceRequest: { select: { id: true, requestNumber: true, title: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to plan work order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
