import { NextRequest, NextResponse } from 'next/server';
import type { PmScheduleTask } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { updatePmAssignment } from '@/services/pm/pmAssignment.service';

async function scopedAssignment(request: NextRequest, id: string) {
  const session = getSession(request);
  if (!session) return { response: NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 }) };
  const scope = await getPlantScope(request, session);
  if (scope.denyAccess) return { response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) };
  const assignment = await db.pmScheduleTask.findUnique({
    where: { id },
    include: { asset: { select: { id: true, plantId: true } } },
  });
  if (!assignment || assignment.scheduleId) {
    return { response: NextResponse.json({ success: false, error: 'Direct PM assignment not found' }, { status: 404 }) };
  }
  if (!canAccessPlantStrict(scope, assignment.asset.plantId)) {
    return { response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) };
  }
  return { session, assignment };
}

function existingInput(assignment: PmScheduleTask) {
  return {
    assetId: assignment.assetId,
    componentId: assignment.componentId,
    pmTaskId: assignment.pmTaskId,
    pmType: assignment.pmType || assignment.maintenanceMode,
    activityMode: assignment.activityMode || 'inspection',
    inspectionType: assignment.equipmentState,
    basis: assignment.basis,
    value: assignment.frequencyInterval,
    unit: assignment.frequencyUnit,
    assetMeterId: assignment.assetMeterId,
    nextDueDate: assignment.nextDueDate?.toISOString?.() ?? assignment.nextDueDate,
    estimatedMinutes: assignment.estimatedMinutes,
    leadDays: assignment.leadDays,
    conditionSourceType: assignment.conditionSourceType,
    conditionSourceId: assignment.conditionSourceId,
    conditionMetric: assignment.conditionMetric,
    conditionOperator: assignment.conditionOperator,
    conditionThreshold: assignment.conditionThreshold,
    conditionThresholdMax: assignment.conditionThresholdMax,
    conditionUnit: assignment.conditionUnit,
    evaluationCadenceMinutes: assignment.evaluationCadenceMinutes,
    isActive: assignment.isActive,
  };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scoped = await scopedAssignment(request, id);
    if ('response' in scoped) return scoped.response;
    if (!isAdmin(scoped.session) && !hasPermission(scoped.session, 'pm_schedules.update') && !hasPermission(scoped.session, 'work_orders.update')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const patch = await request.json();
    const merged = { ...existingInput(scoped.assignment), ...patch };
    const updated = await updatePmAssignment(db, {
      id,
      plantId: scoped.assignment.asset.plantId,
      actorId: scoped.session.userId,
      input: merged,
    });
    await db.auditLog.create({
      data: {
        userId: scoped.session.userId,
        action: 'update',
        entityType: 'pm_assignment',
        entityId: id,
        oldValues: JSON.stringify(existingInput(scoped.assignment)),
        newValues: JSON.stringify(patch),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update PM assignment';
    return NextResponse.json({ success: false, error: message }, { status: /required|must|invalid|belong|active|positive|greater/i.test(message) ? 400 : 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scoped = await scopedAssignment(request, id);
    if ('response' in scoped) return scoped.response;
    if (!isAdmin(scoped.session) && !hasPermission(scoped.session, 'pm_schedules.update') && !hasPermission(scoped.session, 'work_orders.update')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const updated = await db.pmScheduleTask.update({ where: { id }, data: { isActive: false } });
    await db.auditLog.create({
      data: {
        userId: scoped.session.userId,
        action: 'deactivate',
        entityType: 'pm_assignment',
        entityId: id,
        oldValues: JSON.stringify({ isActive: scoped.assignment.isActive }),
        newValues: JSON.stringify({ isActive: false }),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to deactivate PM assignment' }, { status: 500 });
  }
}
