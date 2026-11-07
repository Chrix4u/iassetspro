import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import {
  assessPmInspection, parsePmInspectionRange, pmInspectionMethod,
  type PmInspectionMethod,
} from '@/lib/pm-inspection';

// Technicians may complete a corrective WO before supervisor verification/closure.
// Keep that WO active for deduplication until formally closed or cancelled.
const CLOSED_STATUSES = ['closed', 'cancelled'];
const MAX_ASSIGNMENTS = 500;

function canRead(session: NonNullable<ReturnType<typeof getSession>>) {
  return isAdmin(session)
    || ['pm_schedules.view', 'pm_schedules.update', 'work_orders.view', 'work_orders.view_own', 'digital_twin.view']
      .some((permission) => hasPermission(session, permission));
}

function canRecord(session: NonNullable<ReturnType<typeof getSession>>) {
  return isAdmin(session)
    || ['pm_schedules.update', 'work_orders.update', 'digital_twin.manage']
      .some((permission) => hasPermission(session, permission));
}

function canConfigure(session: NonNullable<ReturnType<typeof getSession>>) {
  return isAdmin(session)
    || hasPermission(session, 'pm_schedules.update')
    || hasPermission(session, 'digital_twin.manage');
}

function asText(input: unknown, max = 200): string {
  return typeof input === 'string' ? input.trim().slice(0, max) : '';
}

function nextPointDate(from: Date, frequency: string): Date | null {
  const date = new Date(from);
  if (frequency === 'daily') date.setUTCDate(date.getUTCDate() + 1);
  else if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else if (frequency === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
  else if (frequency === 'quarterly') date.setUTCMonth(date.getUTCMonth() + 3);
  else if (frequency === 'annually') date.setUTCFullYear(date.getUTCFullYear() + 1);
  else if (frequency === 'hourly') date.setUTCHours(date.getUTCHours() + 1);
  else return null; // PM-owned inspection points use per_start: the PM assignment owns due dates.
  return date;
}

async function allocateInspectionWorkOrderNumber(tx: Prisma.TransactionClient, now: Date) {
  const prefix = 'WO-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0');
  // Share the same number lock as the direct-PM bundle generator.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'iassetspro:pm-wo-number:' + prefix}))`;
  const rows = await tx.workOrder.findMany({
    where: { woNumber: { startsWith: prefix } },
    select: { woNumber: true },
  });
  const highest = rows.reduce((max, row) => {
    const number = Number.parseInt(row.woNumber.slice(prefix.length + 1), 10);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return prefix + '-' + String(highest + 1).padStart(4, '0');
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canRead(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const params = request.nextUrl.searchParams;
    const plantId = asText(params.get('plantId'));
    if (plantId && !canAccessPlantStrict(scope, plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    const assetId = asText(params.get('assetId'));
    const departmentId = asText(params.get('departmentId'));
    const componentId = asText(params.get('componentId'));
    const method = asText(params.get('method'));
    const dueFilter = asText(params.get('due'));
    const resultFilter = asText(params.get('result'));
    const search = asText(params.get('search')).toLowerCase();

    const where: Prisma.PmScheduleTaskWhereInput = {
      scheduleId: null,
      isActive: true,
      activityMode: 'inspection',
      ...(assetId ? { assetId } : {}),
      ...(componentId ? { componentId } : {}),
      asset: {
        ...(plantId
          ? { plantId }
          : scope.isSystemWide ? {} : { plantId: { in: scope.isScoped && scope.plantId ? [scope.plantId] : scope.accessiblePlantIds } }),
        ...(departmentId ? { departmentId } : {}),
      },
    };
    const [rows, totalAssignments] = await Promise.all([
      db.pmScheduleTask.findMany({
        where,
        take: MAX_ASSIGNMENTS,
        include: {
          asset: {
            select: {
              id: true, name: true, assetTag: true, plantId: true, departmentId: true,
              department: { select: { name: true } },
            },
          },
          component: {
            select: {
              id: true, name: true, componentCode: true, componentType: true,
              inspectionPoints: {
                where: { isActive: true },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                include: { records: { orderBy: { inspectedAt: 'desc' }, take: 1 } },
              },
            },
          },
          assetMeter: { select: { currentValue: true, unit: true, name: true } },
          pmTask: { select: { id: true, taskNumber: true, description: true, taskType: true } },
        },
        orderBy: [{ nextDueDate: 'asc' }, { id: 'asc' }],
      }),
      db.pmScheduleTask.count({ where }),
    ]);

    type TaskRow = {
      assignmentId: string;
      taskNumber: number;
      description: string;
      pmType: string;
      equipmentState: string;
      nextDueDate: string | null;
      nextDueReading: number | null;
      currentMeterValue: number | null;
      meterUnit: string | null;
      due: 'overdue' | 'due_soon' | 'scheduled' | 'meter';
    };
    type PointRow = {
      id: string;
      name: string;
      description: string | null;
      method: PmInspectionMethod;
      parameterKey: string | null;
      range: ReturnType<typeof parsePmInspectionRange>;
      latest: { id: string; value: string | null; result: string; findings: string | null; inspectedAt: string } | null;
    };
    type Group = {
      key: string; assetId: string; assetName: string; assetTag: string;
      plantId: string; departmentId: string | null; departmentName: string;
      componentId: string | null; componentName: string; componentCode: string | null;
      tasks: TaskRow[]; points: PointRow[];
    };
    const groups = new Map<string, Group>();
    const now = Date.now();
    for (const row of rows) {
      const key = row.assetId + ':' + (row.componentId || 'machine');
      let group = groups.get(key);
      if (!group) {
        group = {
          key, assetId: row.assetId, assetName: row.asset.name, assetTag: row.asset.assetTag,
          plantId: row.asset.plantId, departmentId: row.asset.departmentId,
          departmentName: row.asset.department?.name || 'Unassigned',
          componentId: row.componentId,
          componentName: row.component?.name || 'Whole machine',
          componentCode: row.component?.componentCode || null,
          tasks: [],
          points: (row.component?.inspectionPoints || []).map((point) => ({
            id: point.id, name: point.name, description: point.description,
            method: pmInspectionMethod(point.inspectionType),
            parameterKey: point.parameterKey,
            range: parsePmInspectionRange(point.normalRange),
            latest: point.records[0]
              ? {
                  id: point.records[0].id, value: point.records[0].value,
                  result: point.records[0].result,
                  findings: point.records[0].findings,
                  inspectedAt: point.records[0].inspectedAt.toISOString(),
                }
              : null,
          })),
        };
        groups.set(key, group);
      }
      const nextMs = row.nextDueDate?.getTime() ?? null;
      const meterReached = row.basis === 'meter' && row.nextDueReading != null
        && row.assetMeter && Number(row.assetMeter.currentValue) >= row.nextDueReading;
      const due: TaskRow['due'] = meterReached || (nextMs != null && nextMs < now)
        ? 'overdue'
        : row.basis === 'meter' ? 'meter'
        : nextMs != null && nextMs <= now + 7 * 86400000 ? 'due_soon' : 'scheduled';
      group.tasks.push({
        assignmentId: row.id,
        taskNumber: row.pmTask.taskNumber,
        description: row.pmTask.description,
        pmType: row.pmType,
        equipmentState: row.equipmentState,
        nextDueDate: row.nextDueDate?.toISOString() || null,
        nextDueReading: row.nextDueReading,
        currentMeterValue: row.assetMeter?.currentValue ?? null,
        meterUnit: row.assetMeter?.unit || null,
        due,
      });
    }

    const items = [...groups.values()].filter((group) => {
      if (search && ![group.assetName, group.assetTag, group.componentName,
        group.componentCode || '', ...group.tasks.map((task) => task.description),
        ...group.points.map((point) => point.name)].some((text) => text.toLowerCase().includes(search))) return false;
      if (method && method !== 'all' && !group.points.some((point) => point.method === method)) return false;
      if (dueFilter && dueFilter !== 'all' && !group.tasks.some((task) => task.due === dueFilter)) return false;
      if (resultFilter && resultFilter !== 'all' && !group.points.some((point) =>
        resultFilter === 'not_recorded' ? !point.latest : point.latest?.result === resultFilter)) return false;
      return true;
    }).sort((a, b) => a.assetName.localeCompare(b.assetName) || a.componentName.localeCompare(b.componentName));

    return NextResponse.json({ success: true, data: { items, totalAssignments, truncated: totalAssignments > MAX_ASSIGNMENTS } });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false, error: error instanceof Error ? error.message : 'Failed to load PM inspection list',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const action = asText(body.action);
    if (action === 'configure_point' ? !canConfigure(session) : !canRecord(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const assignmentId = asText(body.assignmentId);
    if (!assignmentId) return NextResponse.json({ success: false, error: 'PM assignment is required' }, { status: 400 });
    const assignment = await db.pmScheduleTask.findFirst({
      where: { id: assignmentId, scheduleId: null, activityMode: 'inspection', isActive: true },
      select: {
        id: true, assetId: true, componentId: true, equipmentState: true,
        asset: { select: { id: true, name: true, plantId: true, departmentId: true } },
        pmTask: { select: { taskNumber: true, description: true } },
      },
    });
    if (!assignment) return NextResponse.json({ success: false, error: 'Active inspection assignment not found' }, { status: 404 });
    if (!canAccessPlantStrict(scope, assignment.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    if (!assignment.componentId) {
      return NextResponse.json({
        success: false, error: 'Select a machine part: inspection points must have an exact component target',
      }, { status: 400 });
    }

    if (action === 'configure_point') {
      const name = asText(body.name);
      const method = asText(body.method);
      if (!name || !['sight', 'instrument'].includes(method)) {
        return NextResponse.json({ success: false, error: 'Point name and inspection method are required' }, { status: 400 });
      }
      const min = body.min === '' || body.min == null ? undefined : Number(body.min);
      const max = body.max === '' || body.max == null ? undefined : Number(body.max);
      const unit = asText(body.unit, 40);
      if (method === 'instrument' && (!unit || (min === undefined && max === undefined))) {
        return NextResponse.json({ success: false, error: 'Instrument points require a unit and a minimum or maximum limit' }, { status: 400 });
      }
      if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max))
        || (min !== undefined && max !== undefined && min > max)) {
        return NextResponse.json({ success: false, error: 'Invalid parameter limits' }, { status: 400 });
      }
      const point = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'iassetspro:inspection-definition:' + assignment.componentId}))`;
        const duplicate = await tx.componentInspectionPoint.findFirst({
          where: { componentId: assignment.componentId!, name, isActive: true },
          select: { id: true },
        });
        if (duplicate) return { duplicate: true, point: duplicate };
        const created = await tx.componentInspectionPoint.create({
          data: {
            componentId: assignment.componentId!, name, description: asText(body.description, 1000) || null,
            inspectionType: method === 'instrument' ? 'measurement' : 'visual',
            parameterKey: asText(body.parameterKey) || name,
            normalRange: method === 'instrument' ? JSON.stringify({ min, max, unit }) : null,
            frequency: 'per_start', // schedule cadence is owned by PmScheduleTask
          },
        });
        await tx.auditLog.create({ data: {
          userId: session.userId, action: 'create', entityType: 'component_inspection_point',
          entityId: created.id, plantId: assignment.asset.plantId,
          newValues: JSON.stringify({ assignmentId, componentId: assignment.componentId, method, name, min, max, unit }),
        } });
        return { duplicate: false, point: created };
      });
      return NextResponse.json({ success: !point.duplicate, data: point.point,
        ...(point.duplicate ? { error: 'An active inspection point with this name already exists' } : {}),
      }, { status: point.duplicate ? 409 : 201 });
    }

    if (action !== 'record') return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
    const pointId = asText(body.pointId);
    const requestKey = asText(body.requestKey, 100);
    if (!pointId || !/^[a-zA-Z0-9_-]{12,100}$/.test(requestKey)) {
      return NextResponse.json({ success: false, error: 'Inspection point and stable submission key are required' }, { status: 400 });
    }
    const saved = await db.$transaction(async (tx) => {
      // Serialize submissions to one point, including repeated mobile retries.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'iassetspro:inspection-record:' + pointId}))`;
      const priorAudit = await tx.auditLog.findFirst({
        where: { entityType: 'component_inspection_record', plantId: assignment.asset.plantId,
          newValues: { contains: '"requestKey":"' + requestKey + '"' } },
        select: { entityId: true },
      });
      if (priorAudit?.entityId) {
        const existing = await tx.componentInspectionRecord.findUnique({ where: { id: priorAudit.entityId } });
        if (existing) return { record: existing, workOrder: null, repeated: true, outsideRange: false };
      }
      const point = await tx.componentInspectionPoint.findFirst({
        where: { id: pointId, componentId: assignment.componentId!, isActive: true },
      });
      if (!point) throw new Error('Inspection point is unavailable for the selected part');
      const assessment = assessPmInspection({
        method: pmInspectionMethod(point.inspectionType),
        value: body.value, result: body.result, findings: body.findings,
        range: parsePmInspectionRange(point.normalRange),
      });
      if (!assessment.ok) throw new Error(assessment.error);
      const now = new Date();
      const record = await tx.componentInspectionRecord.create({ data: {
        inspectionPointId: point.id, componentId: assignment.componentId!,
        value: assessment.value, result: assessment.result, findings: assessment.findings || null,
        recommendation: asText(body.recommendation, 4000) || null, inspectorId: session.userId, inspectedAt: now,
      } });
      await tx.componentInspectionPoint.update({
        where: { id: point.id },
        data: { lastInspected: now, nextInspection: nextPointDate(now, point.frequency) },
      });
      let workOrder: { id: string; woNumber: string; status: string } | null = null;
      if (assessment.needsCorrectiveWork) {
        const marker = '[inspection-point:' + point.id + ']';
        workOrder = await tx.workOrder.findFirst({
          where: {
            plantId: assignment.asset.plantId, assetId: assignment.assetId,
            type: 'corrective', notes: { contains: marker },
            status: { notIn: CLOSED_STATUSES },
          },
          select: { id: true, woNumber: true, status: true },
          orderBy: { createdAt: 'desc' },
        });
        if (!workOrder) {
          const woNumber = await allocateInspectionWorkOrderNumber(tx, now);
          const title = 'Inspection finding: ' + assignment.asset.name + ' · ' + point.name;
          const created = await tx.workOrder.create({ data: {
            woNumber, title: title.slice(0, 250), type: 'corrective', status: 'draft',
            priority: assessment.result === 'fail' ? 'high' : 'medium',
            assetId: assignment.assetId, assetName: assignment.asset.name,
            plantId: assignment.asset.plantId, departmentId: assignment.asset.departmentId,
            failureDescription: assessment.findings,
            description: 'Inspection result: ' + assessment.result + '. Reading: '
              + (assessment.value ?? 'sight observation') + '. '
              + (asText(body.recommendation, 4000) || ''),
            notes: marker + ' [inspection-record:' + record.id + '] '
              + 'Pending planner/supervisor review. This corrective WO does not reset PM recurrence.',
            workOrderComponents: { create: { componentRegistryId: assignment.componentId! } },
            taskExecutions: { create: {
              taskNumber: 1, taskType: 'inspect', status: 'pending',
              description: 'Investigate and rectify inspection finding at ' + point.name,
              findings: assessment.findings, notes: 'Inspection record ' + record.id,
            } },
          } });
          workOrder = { id: created.id, woNumber: created.woNumber, status: created.status };
          await tx.auditLog.create({ data: {
            userId: session.userId, action: 'create', entityType: 'work_order',
            entityId: created.id, plantId: assignment.asset.plantId,
            newValues: JSON.stringify({ source: 'pm_inspection', inspectionRecordId: record.id,
              inspectionPointId: point.id, assignmentId, result: assessment.result, status: 'draft' }),
          } });
        }
      }
      await tx.auditLog.create({ data: {
        userId: session.userId, action: 'create', entityType: 'component_inspection_record',
        entityId: record.id, plantId: assignment.asset.plantId,
        newValues: JSON.stringify({ requestKey, pointId, assignmentId, result: assessment.result,
          value: assessment.value, outsideRange: assessment.outsideRange, workOrderId: workOrder?.id || null }),
      } });
      return { record, workOrder, repeated: false, outsideRange: assessment.outsideRange };
    });
    return NextResponse.json({ success: true, data: saved, idempotent: saved.repeated }, { status: saved.repeated ? 200 : 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record PM inspection';
    const status = /required|invalid|unavailable|must|choose|describe|inspection point|limits|reading|method|range/i.test(message) ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
