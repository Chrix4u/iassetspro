import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { inspectionDueState, PM_INSPECTION_FREQUENCIES } from '@/lib/pm-inspection';

/** Plant-scoped inspection worksheet sourced from actual machine-part inspection points. */
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'pm_schedules.view') && !hasPermission(session, 'pm_schedules.create') && !hasPermission(session, 'pm_schedules.update')
      && !hasPermission(session, 'work_orders.view')
      && !hasPermission(session, 'work_orders.view_own') && !hasPermission(session, 'digital_twin.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const q = new URL(request.url).searchParams;
    const plantId = q.get('plantId')?.trim();
    if (plantId && (!canAccessPlantStrict(scope, plantId) || (scope.isScoped && scope.plantId && scope.plantId !== plantId))) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    const assetId = q.get('assetId')?.trim();
    const departmentId = q.get('departmentId')?.trim();
    const componentId = q.get('componentId')?.trim();
    const method = q.get('method')?.trim();
    const dueState = q.get('dueState')?.trim();
    const result = q.get('result')?.trim();
    const followUp = q.get('followUp')?.trim();
    const search = q.get('search')?.trim().slice(0, 120);
    const page = Math.max(1, Number.parseInt(q.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(q.get('limit') || '50', 10) || 50));
    if (method && !['visual', 'measurement'].includes(method)) {
      return NextResponse.json({ success: false, error: 'Invalid inspection method' }, { status: 400 });
    }
    if (dueState && !['overdue', 'due_today', 'upcoming', 'unscheduled'].includes(dueState)) {
      return NextResponse.json({ success: false, error: 'Invalid due state' }, { status: 400 });
    }
    if (result && !['pass', 'fail', 'needs_attention', 'not_measured', 'not_inspected'].includes(result)) {
      return NextResponse.json({ success: false, error: 'Invalid result filter' }, { status: 400 });
    }
    if (followUp && !['open', 'none'].includes(followUp)) {
      return NextResponse.json({ success: false, error: 'Invalid corrective follow-up filter' }, { status: 400 });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const where: Prisma.ComponentInspectionPointWhereInput = { isActive: true };
    const assetWhere: Prisma.AssetWhereInput = {};
    if (assetId) assetWhere.id = assetId;
    if (departmentId) assetWhere.departmentId = departmentId;
    if (plantId) assetWhere.plantId = plantId;
    else if (!scope.isSystemWide) {
      assetWhere.plantId = { in: scope.isScoped && scope.plantId ? [scope.plantId] : scope.accessiblePlantIds };
    }
    where.component = { asset: { is: assetWhere } };
    if (componentId) where.componentId = componentId;
    if (method) where.inspectionType = method;
    if (dueState === 'overdue') where.nextInspection = { lt: today };
    if (dueState === 'due_today') where.nextInspection = { gte: today, lt: tomorrow };
    if (dueState === 'upcoming') where.nextInspection = { gte: tomorrow };
    if (dueState === 'unscheduled') where.nextInspection = null;
    if (result === 'not_inspected') where.records = { none: {} };
    else if (result) where.records = { some: { result } };

    // A later passing re-inspection must not hide an unfinished corrective WO.
    // Compose with the historical outcome filter rather than overwriting it.
    const openCorrective: Prisma.ComponentInspectionRecordWhereInput = {
      workOrder: { is: { type: 'corrective', status: { notIn: ['closed', 'cancelled'] } } },
    };
    if (followUp === 'open') where.AND = [{ records: { some: openCorrective } }];
    else if (followUp === 'none') where.AND = [{ records: { none: openCorrective } }];
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { parameterKey: { contains: search, mode: 'insensitive' } },
        { component: { name: { contains: search, mode: 'insensitive' } } },
        { component: { componentCode: { contains: search, mode: 'insensitive' } } },
        { component: { asset: { is: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    const [points, total] = await Promise.all([
      db.componentInspectionPoint.findMany({
        where,
        include: {
          component: {
            select: {
              id: true, name: true, componentCode: true, componentType: true, parentId: true, criticality: true,
              asset: { select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true } },
            },
          },
          records: {
            take: 1, orderBy: [{ inspectedAt: 'desc' }, { id: 'desc' }],
            include: { workOrder: { select: { id: true, woNumber: true, status: true } } },
          },
        },
        orderBy: [{ nextInspection: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.componentInspectionPoint.count({ where }),
    ]);
    // Query only the already plant-authorized page's point IDs. The latest
    // observation may be a Pass while an earlier defect's corrective WO is open.
    const outstanding = points.length ? await db.componentInspectionRecord.findMany({
      where: {
        inspectionPointId: { in: points.map((point) => point.id) },
        workOrder: { is: { type: 'corrective', status: { notIn: ['closed', 'cancelled'] } } },
      },
      select: {
        inspectionPointId: true,
        workOrder: { select: { id: true, woNumber: true, status: true } },
      },
      orderBy: [{ inspectedAt: 'desc' }, { id: 'desc' }],
    }) : [];
    const openCorrectiveByPoint = new Map<string, { id: string; woNumber: string; status: string }>();
    for (const record of outstanding) {
      if (record.workOrder && !openCorrectiveByPoint.has(record.inspectionPointId)) {
        openCorrectiveByPoint.set(record.inspectionPointId, record.workOrder);
      }
    }
    return NextResponse.json({
      success: true,
      data: points.map((point) => ({
        ...point,
        dueState: inspectionDueState(point.nextInspection, now),
        latestRecord: point.records[0] || null,
        openCorrectiveWorkOrder: openCorrectiveByPoint.get(point.id) || null,
        records: undefined,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load PM inspections' }, { status: 500 });
  }
}

/** Planners add visual or instrument inspection points under an existing machine part. */
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'pm_schedules.create') && !hasPermission(session, 'work_orders.create')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const body = await request.json();
    const componentId = typeof body.componentId === 'string' ? body.componentId.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const inspectionType = body.inspectionType;
    const frequency = body.frequency;
    const parameterKey = typeof body.parameterKey === 'string' ? body.parameterKey.trim() : '';
    const unit = typeof body.unit === 'string' ? body.unit.trim() : '';
    if (!componentId || !name || name.length > 180) {
      return NextResponse.json({ success: false, error: 'A machine part and an inspection description are required' }, { status: 400 });
    }
    if (!['visual', 'measurement'].includes(inspectionType)) {
      return NextResponse.json({ success: false, error: 'Choose sight/visual or instrument/measurement inspection' }, { status: 400 });
    }
    if (!PM_INSPECTION_FREQUENCIES.includes(frequency)) {
      return NextResponse.json({ success: false, error: 'Choose a supported calendar inspection interval' }, { status: 400 });
    }
    if (inspectionType === 'measurement' && (!parameterKey || !unit)) {
      return NextResponse.json({ success: false, error: 'Instrument checks require a parameter name and unit' }, { status: 400 });
    }
    const numericBound = (value: unknown) => value === null || value === undefined || value === '' ? null : Number(value);
    const min = numericBound(body.min);
    const max = numericBound(body.max);
    const warningMin = numericBound(body.warningMin);
    const warningMax = numericBound(body.warningMax);
    if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max)) || (min !== null && max !== null && min > max)) {
      return NextResponse.json({ success: false, error: 'Provide valid minimum and maximum limits' }, { status: 400 });
    }
    if ((warningMin !== null && !Number.isFinite(warningMin))
      || (warningMax !== null && !Number.isFinite(warningMax))
      || (warningMin !== null && warningMax !== null && warningMin > warningMax)
      || (min !== null && warningMin !== null && warningMin < min)
      || (max !== null && warningMax !== null && warningMax > max)
      || (max !== null && warningMin !== null && warningMin > max)
      || (min !== null && warningMax !== null && warningMax < min)
      || (inspectionType !== 'measurement' && (warningMin !== null || warningMax !== null))
      || (min === null && max === null && (warningMin !== null || warningMax !== null))) {
      return NextResponse.json({ success: false, error: 'Warning limits must be valid instrument thresholds inside the approved min/max' }, { status: 400 });
    }
    const nextInspection = body.nextInspection ? new Date(body.nextInspection) : new Date();
    if (!Number.isFinite(nextInspection.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid first inspection date' }, { status: 400 });
    }
    const component = await db.componentRegistry.findUnique({
      where: { id: componentId }, select: { id: true, asset: { select: { id: true, plantId: true } } },
    });
    if (!component?.asset) return NextResponse.json({ success: false, error: 'Machine part has no assigned asset' }, { status: 404 });
    if (!canAccessPlantStrict(scope, component.asset.plantId)) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const point = await db.componentInspectionPoint.create({
      data: {
        componentId,
        name,
        description: typeof body.description === 'string' ? body.description.trim().slice(0, 3000) || null : null,
        inspectionType,
        parameterKey: inspectionType === 'measurement' ? parameterKey : null,
        normalRange: inspectionType === 'measurement' ? JSON.stringify({ min, max, unit,
          ...(warningMin !== null ? { warningMin } : {}),
          ...(warningMax !== null ? { warningMax } : {}),
        }) : null,
        frequency,
        nextInspection,
      },
    });
    await db.auditLog.create({
      data: {
        userId: session.userId, action: 'create', entityType: 'component_inspection_point', entityId: point.id,
        plantId: component.asset.plantId,
        newValues: JSON.stringify({ componentId, name, inspectionType, parameterKey: point.parameterKey, frequency, nextInspection }),
      },
    });
    return NextResponse.json({ success: true, data: point }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to create inspection point' }, { status: 500 });
  }
}
