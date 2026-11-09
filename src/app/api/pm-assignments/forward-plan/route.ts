import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import type { PmForwardTask, PmForwardBasis } from '@/lib/pm-forward-capacity';

const MAX_TASKS = 10000;
const MAX_LINKED_EXECUTIONS = 30000;
const CLOSED_WO_STATUSES = ['closed', 'verified', 'cancelled'];

/**
 * Read-only, plant-isolated, company-wide PM demand feed. Calendar and Meter
 * are the only selectable frequency modes. No speculative meter due dates.
 * The client calculates its explicit staffing scenario; this API never
 * claims an operator/technician is available.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({
      success: false, error: 'Not authenticated',
    }, { status: 401 });
    if (!isAdmin(session) && ![
      'pm_schedules.view', 'pm_schedules.create', 'pm_schedules.update',
      'pm_analytics.view', 'work_orders.view',
    ].some((permission) => hasPermission(session, permission))) {
      return NextResponse.json({ success: false, error: 'Insufficient PM planning permission' }, { status: 403 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({
      success: false, error: 'Plant access denied',
    }, { status: 403 });
    const plantId = new URL(request.url).searchParams.get('plantId')?.trim() || '';
    if (plantId && (plantId.length > 120 || !canAccessPlantStrict(scope, plantId))) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    const assetWhere: Prisma.AssetWhereInput = plantId
      ? { plantId }
      : scope.isSystemWide
        ? {}
        : { plantId: { in: scope.isScoped && scope.plantId
          ? [scope.plantId] : scope.accessiblePlantIds } };
    const assignments = await db.pmScheduleTask.findMany({
      where: {
        isActive: true,
        asset: { is: assetWhere },
        pmTask: { is: { isActive: true } },
        OR: [{ scheduleId: null }, { schedule: { is: { isActive: true } } }],
      },
      select: {
        id: true, assetId: true, componentId: true, pmType: true,
        basis: true, activityMode: true, equipmentState: true,
        estimatedMinutes: true, nextDueDate: true, nextDueReading: true,
        lastGeneratedCycleKey: true,
        asset: { select: {
          name: true, assetTag: true, plantId: true, criticality: true, status: true,
          plant: { select: { name: true } },
        } },
        component: { select: { name: true, componentCode: true } },
        pmTask: { select: { taskNumber: true, description: true } },
        assetMeter: { select: {
          currentValue: true, name: true, unit: true, lastReadingAt: true, isActive: true,
        } },
      },
      orderBy: [{ assetId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_TASKS + 1,
    });
    if (assignments.length > MAX_TASKS) {
      return NextResponse.json({
        success: false,
        error: 'The plant-wide PM register exceeds 10,000 active tasks. Select one plant to create a complete, non-truncated forecast.',
      }, { status: 422 });
    }
    // Query only task-executions belonging to the already plant-scoped assignments.
    // Match the CURRENT due-cycle key, never an old work order from a previous cycle.
    const executions = assignments.length
      ? await db.workOrderTaskExecution.findMany({
        where: {
          pmScheduleTaskId: { in: assignments.map((row) => row.id) },
          workOrder: { is: { status: { notIn: CLOSED_WO_STATUSES } } },
        },
        select: {
          pmScheduleTaskId: true, pmDueCycleKey: true,
          workOrder: { select: { id: true, woNumber: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_LINKED_EXECUTIONS + 1,
      })
      : [];
    if (executions.length > MAX_LINKED_EXECUTIONS) {
      return NextResponse.json({
        success: false,
        error: 'Too many open PM work-order links for a complete plan. Narrow the register to one plant.',
      }, { status: 422 });
    }
    const executionMap = new Map<string, (typeof executions)[number]>();
    const keys = new Map(assignments.map((row) => [row.id, row.lastGeneratedCycleKey]));
    for (const execution of executions) {
      if (!execution.pmScheduleTaskId) continue;
      const generatedKey = keys.get(execution.pmScheduleTaskId);
      if (generatedKey === undefined) continue;
      if ((execution.pmDueCycleKey || null) !== (generatedKey || null)) continue;
      if (!executionMap.has(execution.pmScheduleTaskId)) {
        executionMap.set(execution.pmScheduleTaskId, execution);
      }
    }
    const items: PmForwardTask[] = assignments.map((row) => {
      const basis: PmForwardBasis = row.basis === 'calendar' ? 'calendar'
        : row.basis === 'meter' ? 'meter' : 'legacy_review';
      const execution = executionMap.get(row.id);
      const reading = row.assetMeter?.isActive === true
        ? Number(row.assetMeter.currentValue) : null;
      return {
        id: row.id, assetId: row.assetId, assetName: row.asset.name,
        assetCode: row.asset.assetTag, assetCriticality: row.asset.criticality,
        assetStatus: row.asset.status,
        plantId: row.asset.plantId, plantName: row.asset.plant.name,
        componentId: row.componentId, componentName: row.component?.name || null,
        componentCode: row.component?.componentCode || null,
        taskNumber: row.pmTask.taskNumber, description: row.pmTask.description,
        activityMode: row.activityMode, equipmentState: row.equipmentState,
        basis, dueAt: row.nextDueDate?.toISOString() || null,
        nextDueReading: row.nextDueReading,
        meterValue: Number.isFinite(reading) ? reading : null,
        meterUnit: row.assetMeter?.unit || null,
        meterName: row.assetMeter?.name || null,
        meterLastReadingAt: row.assetMeter?.lastReadingAt?.toISOString() || null,
        estimatedMinutes: row.estimatedMinutes,
        openWorkOrder: execution ? {
          id: execution.workOrder.id, woNumber: execution.workOrder.woNumber,
          status: execution.workOrder.status,
        } : null,
      };
    });
    return NextResponse.json({
      success: true, data: { generatedAt: new Date().toISOString(), items },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: unknown) {
    console.error('[PM forward plan] Could not build read-only planning outlook', error);
    return NextResponse.json({
      success: false, error: 'Could not load PM forward plan',
    }, { status: 500 });
  }
}
