import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

const ALLOWED_RESULTS = ['fail', 'needs_attention', 'conditional'] as const;
const FOLLOW_UP = ['all', 'open', 'none', 'closed'] as const;

function inspectionDay(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

/**
 * Plant-authorized, historical exception events rather than just the latest
 * state of each part. A later PASS must never hide a previous failed record
 * with an unresolved corrective work order.
 *
 * Historical records have no persisted running/standstill snapshot. The API
 * deliberately does not pretend to know that operating state.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session)
      && !hasPermission(session, 'pm_schedules.view')
      && !hasPermission(session, 'pm_schedules.update')
      && !hasPermission(session, 'work_orders.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const q = new URL(request.url).searchParams;
    const plantId = q.get('plantId')?.trim() || '';
    if (plantId && (!canAccessPlantStrict(scope, plantId)
      || (scope.isScoped && scope.plantId && scope.plantId !== plantId))) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const result = q.get('result') || 'all';
    const followUp = q.get('followUp') || 'all';
    const assetId = q.get('assetId')?.trim().slice(0, 120) || '';
    const departmentId = q.get('departmentId')?.trim().slice(0, 120) || '';
    const dateFrom = q.get('from') || '';
    const dateTo = q.get('to') || '';
    const page = Math.max(1, Number.parseInt(q.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(q.get('limit') || '25', 10) || 25));
    if (result !== 'all' && !ALLOWED_RESULTS.includes(result as typeof ALLOWED_RESULTS[number])) {
      return NextResponse.json({ success: false, error: 'Invalid exception result filter' }, { status: 400 });
    }
    if (!FOLLOW_UP.includes(followUp as typeof FOLLOW_UP[number])) {
      return NextResponse.json({ success: false, error: 'Invalid corrective work-order filter' }, { status: 400 });
    }
    const from = dateFrom ? inspectionDay(dateFrom) : null;
    const to = dateTo ? inspectionDay(dateTo, true) : null;
    if ((dateFrom && !from) || (dateTo && !to) || (from && to && from > to)) {
      return NextResponse.json({ success: false, error: 'Invalid inspection date range' }, { status: 400 });
    }

    const assetWhere: Prisma.AssetWhereInput = {};
    if (assetId) assetWhere.id = assetId;
    if (departmentId) assetWhere.departmentId = departmentId;
    if (plantId) assetWhere.plantId = plantId;
    else if (!scope.isSystemWide) {
      assetWhere.plantId = {
        in: scope.isScoped && scope.plantId ? [scope.plantId] : scope.accessiblePlantIds,
      };
    }
    const where: Prisma.ComponentInspectionRecordWhereInput = {
      component: { asset: { is: assetWhere } },
      result: result === 'all' ? { in: [...ALLOWED_RESULTS] } : result,
    };
    if (from || to) {
      where.inspectedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }
    if (followUp === 'open') {
      where.workOrder = { is: { type: 'corrective', status: { notIn: ['closed', 'cancelled'] } } };
    } else if (followUp === 'closed') {
      where.workOrder = { is: { type: 'corrective', status: { in: ['closed', 'cancelled'] } } };
    } else if (followUp === 'none') {
      where.workOrderId = null;
    }

    const [records, total] = await Promise.all([
      db.componentInspectionRecord.findMany({
        where,
        select: {
          id: true, result: true, value: true, findings: true, recommendation: true, inspectedAt: true,
          equipmentState: true,
          inspector: { select: { id: true, fullName: true } },
          inspectionPoint: {
            select: { id: true, name: true, inspectionType: true, parameterKey: true, normalRange: true },
          },
          component: {
            select: {
              id: true, name: true, componentCode: true,
              asset: { select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true } },
            },
          },
          workOrder: { select: { id: true, woNumber: true, status: true } },
        },
        orderBy: [{ inspectedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.componentInspectionRecord.count({ where }),
    ]);
    return NextResponse.json({
      success: true,
      data: records.map((record) => ({
        ...record,
        // Use the state saved at inspection time; old records are unknown.
        equipmentState: record.equipmentState === 'running' || record.equipmentState === 'standstill'
          ? record.equipmentState : null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false, error: error instanceof Error ? error.message : 'Could not load inspection exceptions',
    }, { status: 500 });
  }
}
