import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { inspectionDueState } from '@/lib/pm-inspection';

/** Existing direct-PM inspection tasks are displayed without inventing inspection methods or ranges. */
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'pm_schedules.view')
      && !hasPermission(session, 'pm_schedules.create') && !hasPermission(session, 'pm_schedules.update')
      && !hasPermission(session, 'work_orders.view') && !hasPermission(session, 'work_orders.view_own')
      && !hasPermission(session, 'digital_twin.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    const q = new URL(request.url).searchParams;
    const assetId = q.get('assetId')?.trim();
    const departmentId = q.get('departmentId')?.trim();
    const componentId = q.get('componentId')?.trim();
    const search = q.get('search')?.trim().slice(0, 120);
    const where: Prisma.PmScheduleTaskWhereInput = {
      scheduleId: null,
      isActive: true,
      activityMode: 'inspection',
    };
    if (assetId) where.assetId = assetId;
    if (componentId) where.componentId = componentId;
    // Compose the department filter with the mandatory plant restriction.
    const assetWhere: Prisma.AssetWhereInput = {};
    if (departmentId) assetWhere.departmentId = departmentId;
    if (!scope.isSystemWide) {
      assetWhere.plantId = { in: scope.isScoped && scope.plantId ? [scope.plantId] : scope.accessiblePlantIds };
    }
    if (Object.keys(assetWhere).length > 0) where.asset = assetWhere;
    if (search) {
      where.OR = [
        { pmTask: { description: { contains: search, mode: 'insensitive' } } },
        { component: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { asset: { name: { contains: search, mode: 'insensitive' } } },
        { asset: { assetTag: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const assignments = await db.pmScheduleTask.findMany({
      where,
      take: 250,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, plantId: true } },
        component: { select: { id: true, name: true, componentCode: true, componentType: true } },
        assetMeter: { select: { id: true, name: true, unit: true, currentValue: true } },
        pmTask: { select: { id: true, taskNumber: true, description: true, taskType: true } },
      },
      orderBy: [{ nextDueDate: 'asc' }, { createdAt: 'asc' }],
    });
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const rows = assignments.map((task) => {
      const meterBased = task.basis === 'meter' || task.pmType === 'ubm';
      const reading = task.assetMeter?.currentValue;
      const threshold = task.nextDueReading;
      const dueState = meterBased
        ? threshold == null || reading == null ? 'unscheduled' : Number(reading) >= Number(threshold) ? 'due_today' : 'upcoming'
        : inspectionDueState(task.nextDueDate, now);
      return {
        id: task.id,
        asset: task.asset,
        component: task.component,
        pmTask: task.pmTask,
        pmType: task.pmType,
        basis: meterBased ? 'meter' : 'calendar',
        nextDueDate: task.nextDueDate,
        nextDueReading: threshold,
        currentReading: reading ?? null,
        meterUnit: task.assetMeter?.unit ?? null,
        equipmentState: task.equipmentState,
        dueState,
      };
    });
    return NextResponse.json({ success: true, data: rows, shown: rows.length, capped: assignments.length === 250 });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load scheduled inspections' }, { status: 500 });
  }
}
