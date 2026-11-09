import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { inspectionDueState } from '@/lib/pm-inspection';
import {
  groupMachineInspectionChecklist,
  type MachineChecklistPoint,
  type MachineChecklistTask,
  type MachineInspectionState,
} from '@/lib/pm-machine-checklist';

/**
 * On-demand, plant-scoped inspection list for ONE machine and one operating state.
 * A task is a PM assignment; the recordable checks are explicitly configured
 * on that task's exact registered part. No fake readings or acceptance limits.
 * This is a read-only generation endpoint; actual entries use the existing
 * idempotent per-point capture endpoint with corrective WO safeguards.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session)
      && !hasPermission(session, 'pm_schedules.view')
      && !hasPermission(session, 'pm_schedules.create')
      && !hasPermission(session, 'pm_schedules.update')
      && !hasPermission(session, 'work_orders.view')
      && !hasPermission(session, 'work_orders.view_own')
      && !hasPermission(session, 'digital_twin.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const query = new URL(request.url).searchParams;
    const assetId = query.get('assetId')?.trim();
    const equipmentState = query.get('equipmentState')?.trim() as MachineInspectionState | undefined;
    if (!assetId || assetId.length > 120 || !['running', 'standstill'].includes(equipmentState || '')) {
      return NextResponse.json({ success: false, error: 'Select a machine and Running or Standstill inspection state' }, { status: 400 });
    }

    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, assetTag: true, plantId: true },
    });
    if (!asset) return NextResponse.json({ success: false, error: 'Machine not found' }, { status: 404 });
    if (!canAccessPlantStrict(scope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const assignmentWhere: Prisma.PmScheduleTaskWhereInput = {
      assetId,
      isActive: true,
      activityMode: 'inspection',
      equipmentState: { in: equipmentState === 'running' ? ['running'] : ['standstill', 'stopped'] },
      pmTask: { is: { isActive: true } },
      OR: [
        { scheduleId: null },
        { schedule: { is: { isActive: true } } },
      ],
    };
    const assignments = await db.pmScheduleTask.findMany({
      where: assignmentWhere,
      include: {
        pmTask: { select: { id: true, taskNumber: true, description: true, taskType: true } },
        component: { select: { id: true, name: true, componentCode: true, componentType: true, assetId: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 1501,
    });
    if (assignments.length > 1500) {
      return NextResponse.json({
        success: false,
        error: 'The selected machine has more than 1,500 inspection assignments; split the scope in PM Planning before generating a complete checklist.',
      }, { status: 422 });
    }

    const componentIds = Array.from(new Set(assignments.flatMap((task) =>
      task.componentId && task.component?.assetId === asset.id ? [task.componentId] : [])));
    const points = componentIds.length ? await db.componentInspectionPoint.findMany({
      where: {
        componentId: { in: componentIds },
        isActive: true,
      },
      include: {
        records: {
          orderBy: { inspectedAt: 'desc' },
          take: 1,
          select: { id: true, result: true, value: true, findings: true, inspectedAt: true, equipmentState: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 3001,
    }) : [];
    if (points.length > 3000) {
      return NextResponse.json({
        success: false,
        error: 'More than 3,000 inspection points were configured. Split the checklist by maintenance assignment before recording.',
      }, { status: 422 });
    }

    // Fetch outstanding corrective links independently of the latest record.
    // A subsequent passing re-inspection does not erase the older open WO.
    const pending = points.length ? await db.componentInspectionRecord.findMany({
      where: {
        inspectionPointId: { in: points.map((point) => point.id) },
        workOrder: { is: { type: 'corrective', status: { notIn: ['closed', 'cancelled'] } } },
      },
      orderBy: { inspectedAt: 'desc' },
      select: {
        inspectionPointId: true,
        workOrder: { select: { id: true, woNumber: true, status: true } },
      },
    }) : [];
    const openByPoint = new Map<string, { id: string; woNumber: string; status: string }>();
    for (const record of pending) {
      if (record.workOrder && !openByPoint.has(record.inspectionPointId)) {
        openByPoint.set(record.inspectionPointId, record.workOrder);
      }
    }

    const tasks: MachineChecklistTask[] = assignments.map((task) => ({
      id: task.id,
      componentId: task.component?.assetId === asset.id ? task.componentId : null,
      component: task.component?.assetId === asset.id
        ? {
          id: task.component.id,
          name: task.component.name,
          componentCode: task.component.componentCode,
          componentType: task.component.componentType,
        } : null,
      pmTask: task.pmTask,
      pmType: task.pmType,
      basis: task.basis,
      nextDueDate: task.nextDueDate,
      nextDueReading: task.nextDueReading,
      equipmentState: task.equipmentState === 'stopped' ? 'standstill' : task.equipmentState,
    }));
    const now = new Date();
    const items: MachineChecklistPoint[] = points.map((point) => ({
      id: point.id,
      componentId: point.componentId,
      name: point.name,
      description: point.description,
      inspectionType: point.inspectionType,
      parameterKey: point.parameterKey,
      normalRange: point.normalRange,
      frequency: point.frequency,
      nextInspection: point.nextInspection,
      dueState: inspectionDueState(point.nextInspection, now),
      latestRecord: point.records[0]
        ? {
          ...point.records[0],
          // Prisma stores a nullable string; expose only the two explicitly
          // validated states and never infer historical state from PM plans.
          equipmentState: point.records[0].equipmentState === 'running'
            || point.records[0].equipmentState === 'standstill'
              ? point.records[0].equipmentState as 'running' | 'standstill'
              : null,
        }
        : null,
      openCorrectiveWorkOrder: openByPoint.get(point.id) || null,
    }));
    const grouped = groupMachineInspectionChecklist(tasks, items);
    return NextResponse.json({
      success: true,
      data: {
        machine: asset,
        equipmentState,
        generatedAt: now.toISOString(),
        totalAssignments: assignments.length,
        totalConfiguredPoints: grouped.groups.reduce((n, group) => n + group.points.length, 0),
        ...grouped,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Could not generate machine inspection checklist',
    }, { status: 500 });
  }
}
