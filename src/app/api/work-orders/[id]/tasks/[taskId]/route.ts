import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import {
  WORK_ORDER_TASK_STATUSES,
  canTransitionWorkOrderTask,
  isWorkOrderTaskStatus,
  taskTransitionError,
} from '@/lib/work-order-task-transitions';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id, taskId } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { status, notes, findings } = body;

    if (!isWorkOrderTaskStatus(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${WORK_ORDER_TASK_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const task = await db.workOrderTaskExecution.findUnique({
      where: { id: taskId },
      include: {
        workOrder: {
          select: {
            id: true,
            assignedTo: true,
            teamLeaderId: true,
            teamMembers: { select: { userId: true, role: true, accessLevel: true } },
          },
        },
      },
    });

    if (!task || task.workOrderId !== id) {
      return NextResponse.json({ success: false, error: 'Task execution not found' }, { status: 404 });
    }

    // Managers are intentionally admin-equivalent for execution controls, as
    // reflected by the work-order capabilities endpoint. Read-only team
    // membership, however, must never grant mutation access.
    const wo = task.workOrder;
    const isAssignee = wo.assignedTo === session.userId;
    const isTeamLeader = wo.teamLeaderId === session.userId;
    const isWritableTeamMember = wo.teamMembers?.some(
      tm => tm.userId === session.userId && tm.accessLevel !== 'read_only',
    ) || false;
    const adminUser = isAdmin(session) || session.roles.some(role =>
      ['maintenance_manager', 'plant_manager'].includes(role),
    );

    if (!adminUser && !isAssignee && !isTeamLeader && !isWritableTeamMember) {
      return NextResponse.json(
        { success: false, error: 'Only WO assignee, writable team members, managers, or admin can update tasks' },
        { status: 403 },
      );
    }

    if (!canTransitionWorkOrderTask(task.status, status)) {
      return NextResponse.json(
        { success: false, error: taskTransitionError(task.status, status) },
        { status: 400 }
      );
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: now,
    };

    if (['completed', 'skipped', 'failed'].includes(status)) {
      updateData.completedAt = now;
      updateData.completedById = session.userId;
    }

    if (['pending', 'in_progress'].includes(status)) {
      updateData.completedAt = null;
      updateData.completedById = null;
    }

    if (notes && typeof notes === 'string' && notes.trim()) {
      const existingNotes = task.notes || '';
      const timestamp = now.toISOString();
      const newNote = `[${timestamp}] ${session.username}: ${notes.trim()}`;
      updateData.notes = existingNotes ? `${existingNotes}\n${newNote}` : newNote;
    }

    if (findings !== undefined) {
      updateData.findings = typeof findings === 'string' && findings.trim() ? findings.trim() : null;
    }

    const updatedTask = await db.workOrderTaskExecution.update({
      where: { id: taskId },
      data: updateData,
      include: {
        completedBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'wo_task_execution',
        entityId: taskId,
        oldValues: JSON.stringify({ status: task.status }),
        newValues: JSON.stringify({
          status,
          notes: notes || undefined,
          findings: findings || undefined,
        }),
      },
    });

    return NextResponse.json({ success: true, data: updatedTask });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update task';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
