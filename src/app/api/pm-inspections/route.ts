import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import {
  classifyInspection, inspectionDueState, INSPECTION_METHODS, INSPECTION_RESULTS,
  isCorrectiveInspectionResult, parseInspectionRange,
  type InspectionMethod, type InspectionResult,
} from '@/lib/pm-inspection-policy';

const ERROR = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });
const CLOSED_WO_STATES = ['closed', 'cancelled'];

// The inspection register is a PM-owned view of exact component inspection points.
// These readings NEVER advance PM recurrence. The PM closure service alone does that.
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return ERROR('Not authenticated', 401);
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return ERROR('Access denied', 403);
    const query = new URL(request.url).searchParams;
    const plantId = query.get('plantId') || '';
    if (plantId && !canAccessPlantStrict(scope, plantId)) return ERROR('Access denied', 403);

    const assetWhere: Prisma.AssetWhereInput = {};
    if (plantId) assetWhere.plantId = plantId;
    else if (scope.isScoped && scope.plantId) assetWhere.plantId = scope.plantId;
    else if (!scope.isSystemWide) assetWhere.plantId = { in: scope.accessiblePlantIds };
    if (query.get('departmentId')) assetWhere.departmentId = query.get('departmentId');
    const where: Prisma.PmScheduleTaskWhereInput = {
      isActive: true,
      activityMode: 'inspection',
      asset: assetWhere,
    };
    const assetId = query.get('assetId');
    const componentId = query.get('componentId');
    if (assetId) where.assetId = assetId;
    if (componentId) where.componentId = componentId;

    const assignments = await db.pmScheduleTask.findMany({
      where,
      take: 501,
      orderBy: [{ nextDueDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        asset: { select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true, department: { select: { name: true } } } },
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
        assetMeter: { select: { currentValue: true } },
        pmTask: { select: { taskNumber: true, description: true, taskType: true } },
      },
    });

    const now = new Date();
    const assetIds = [...new Set(assignments.map((row) => row.assetId))];
    const openWorkOrders = assetIds.length
      ? await db.workOrder.findMany({
          where: {
            assetId: { in: assetIds },
            type: 'corrective',
            status: { notIn: CLOSED_WO_STATES },
            notes: { contains: '[pm-inspection-point:' },
          },
          select: { id: true, woNumber: true, status: true, notes: true, assetId: true },
          orderBy: { createdAt: 'desc' },
          take: 1000,
        })
      : [];
    const openByPoint = new Map<string, { id: string; woNumber: string; status: string }>();
    for (const wo of openWorkOrders) {
      const marker = '[pm-inspection-point:';
      const start = (wo.notes || '').indexOf(marker);
      const end = start < 0 ? -1 : (wo.notes || '').indexOf(']', start + marker.length);
      const pointId = end < 0 ? null : (wo.notes || '').slice(start + marker.length, end);
      if (!pointId || !wo.assetId) continue;
      const key = wo.assetId + ':' + pointId;
      if (!openByPoint.has(key)) openByPoint.set(key, { id: wo.id, woNumber: wo.woNumber, status: wo.status });
    }
    const rows = assignments.slice(0, 500).flatMap((assignment) => {
      const points = assignment.component?.inspectionPoints || [];
      const records = points.length ? points : [null];
      return records.map((point) => {
        const latest = point?.records[0] || null;
        const basis = assignment.basis === 'meter' ? 'meter' : 'calendar';
        const dueState = inspectionDueState({
          basis,
          nextDueDate: assignment.nextDueDate,
          nextDueReading: assignment.nextDueReading,
          currentMeterValue: assignment.assetMeter ? Number(assignment.assetMeter.currentValue) : null,
          now,
        });
        return {
          key: assignment.id + ':' + (point?.id || 'unconfigured'),
          assignmentId: assignment.id,
          assetId: assignment.assetId,
          assetName: assignment.asset.name,
          assetTag: assignment.asset.assetTag,
          plantId: assignment.asset.plantId,
          departmentId: assignment.asset.departmentId,
          departmentName: assignment.asset.department?.name || 'Unassigned',
          componentId: assignment.componentId,
          componentName: assignment.component?.name || 'Whole machine',
          componentCode: assignment.component?.componentCode || '',
          taskNumber: assignment.pmTask.taskNumber,
          task: assignment.pmTask.description,
          equipmentState: assignment.equipmentState,
          inspectionPointId: point?.id || null,
          inspectionPointName: point?.name || '',
          method: point?.inspectionType || 'unconfigured',
          parameterKey: point?.parameterKey || null,
          normalRange: parseInspectionRange(point?.normalRange),
          nextDueDate: assignment.nextDueDate?.toISOString() || null,
          nextDueReading: assignment.nextDueReading,
          meterUnit: assignment.frequencyUnit,
          currentMeterValue: assignment.assetMeter ? Number(assignment.assetMeter.currentValue) : null,
          dueState,
          lastResult: latest?.result || null,
          lastValue: latest?.value || null,
          lastInspectedAt: latest?.inspectedAt?.toISOString() || null,
          latestFindings: latest?.findings || null,
          openCorrective: point ? openByPoint.get(assignment.assetId + ':' + point.id) || null : null,
        };
      });
    });

    const search = (query.get('search') || '').toLowerCase().trim();
    const method = query.get('method');
    const dueState = query.get('dueState');
    const result = query.get('result');
    const filtered = rows.filter((row) =>
      (!method || row.method === method)
      && (!dueState || row.dueState === dueState)
      && (!result || (result === 'pending' ? !row.lastResult : row.lastResult === result))
      && (!search || [row.assetName, row.assetTag, row.componentName, row.componentCode, row.task, row.inspectionPointName, row.parameterKey || ''].some((value) => value.toLowerCase().includes(search)))
    );

    return NextResponse.json({
      success: true,
      data: {
        rows: filtered,
        truncated: assignments.length > 500,
        summary: {
          total: filtered.length,
          overdue: filtered.filter((row) => row.dueState === 'overdue' || row.dueState === 'meter_due').length,
          unconfigured: filtered.filter((row) => row.method === 'unconfigured').length,
          attention: filtered.filter((row) => row.lastResult === 'fail' || row.lastResult === 'needs_attention').length,
          openCorrective: filtered.filter((row) => Boolean(row.openCorrective)).length,
        },
      },
    });
  } catch (error: unknown) {
    return ERROR(error instanceof Error ? error.message : 'Failed to load PM inspection list', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return ERROR('Not authenticated', 401);
    if (!isAdmin(session) && ![
      'pm_schedules.update', 'pm_schedules.run', 'work_orders.create', 'work_orders.update',
    ].some((permission) => hasPermission(session, permission))) {
      return ERROR('Insufficient inspection-recording permissions', 403);
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return ERROR('Access denied', 403);
    const input = await request.json();
    const assignmentId = typeof input.assignmentId === 'string' ? input.assignmentId.trim() : '';
    if (!assignmentId) return ERROR('PM assignment is required', 400);
    const assignment = await db.pmScheduleTask.findFirst({
      where: { id: assignmentId, isActive: true, activityMode: 'inspection' },
      include: {
        asset: { select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true } },
        component: { select: { id: true, assetId: true, name: true, componentCode: true } },
      },
    });
    if (!assignment || !assignment.componentId || !assignment.component) {
      return ERROR('An active part-targeted PM inspection is required', 404);
    }
    if (!canAccessPlantStrict(scope, assignment.asset.plantId)) return ERROR('Access denied', 403);
    if (assignment.component.assetId !== assignment.assetId) return ERROR('Inspection component does not belong to this machine', 409);

    if (input.action === 'configure') {
      if (!isAdmin(session) && !hasPermission(session, 'pm_schedules.update')) return ERROR('PM planning permission required', 403);
      const method: InspectionMethod = input.method;
      if (!INSPECTION_METHODS.includes(method)) return ERROR('Valid inspection method required', 400);
      const name = String(input.name || '').trim().slice(0, 160);
      if (!name) return ERROR('Inspection point name is required', 400);
      const parameterKey = String(input.parameterKey || '').trim().slice(0, 100) || null;
      const needsReading = method === 'measurement' || method === 'dimensional';
      if (needsReading && !parameterKey) return ERROR('A parameter is required for instrument inspections', 400);
      const range = parseInspectionRange({ min: input.min, max: input.max, unit: input.unit });
      if ((input.min !== '' && input.min != null || input.max !== '' && input.max != null) && !range) {
        return ERROR('Invalid minimum/maximum limits', 400);
      }
      const pointId = typeof input.inspectionPointId === 'string' ? input.inspectionPointId : '';
      if (pointId) {
        const exists = await db.componentInspectionPoint.findFirst({ where: { id: pointId, componentId: assignment.componentId, isActive: true } });
        if (!exists) return ERROR('Inspection point not found on the selected part', 404);
      }
      const payload = {
        name,
        inspectionType: method,
        parameterKey,
        normalRange: range ? JSON.stringify(range) : null,
      };
      const point = pointId
        // Do not rewrite independent component-inspection cadence on edit.
        ? await db.componentInspectionPoint.update({ where: { id: pointId }, data: payload })
        // PM-owned checklist points inherit their due point from the PM assignment.
        : await db.componentInspectionPoint.create({ data: {
            ...payload, componentId: assignment.componentId,
            frequency: 'per_start', nextInspection: null,
          } });
      await db.auditLog.create({
        data: {
          userId: session.userId, action: pointId ? 'update' : 'create',
          entityType: 'component_inspection_point', entityId: point.id,
          newValues: JSON.stringify({ assignmentId, componentId: assignment.componentId, ...payload }),
          plantId: assignment.asset.plantId,
        },
      });
      return NextResponse.json({ success: true, data: point }, { status: pointId ? 200 : 201 });
    }

    if (input.action !== 'record') return ERROR('Unsupported inspection action', 400);
    const pointId = String(input.inspectionPointId || '');
    const submissionId = String(input.submissionId || '');
    if (!/^pmir_[0-9a-f-]{36}$/i.test(submissionId)) return ERROR('Valid unique submission ID required', 400);
    const result: InspectionResult = input.result;
    if (!INSPECTION_RESULTS.includes(result)) return ERROR('Valid inspection outcome required', 400);
    let findings = String(input.findings || '').trim().slice(0, 2000);
    const recommendation = String(input.recommendation || '').trim().slice(0, 1000);
    const point = await db.componentInspectionPoint.findFirst({
      where: { id: pointId, componentId: assignment.componentId, isActive: true },
    });
    if (!point || !INSPECTION_METHODS.includes(point.inspectionType as InspectionMethod)) return ERROR('Invalid inspection point for this part', 404);
    if ((point.inspectionType === 'measurement' || point.inspectionType === 'dimensional')
      && point.normalRange && !parseInspectionRange(point.normalRange)) {
      return ERROR('Inspection range configuration is invalid; ask the planner to correct it', 409);
    }

    let evaluated: ReturnType<typeof classifyInspection>;
    try {
      evaluated = classifyInspection({
        method: point.inspectionType as InspectionMethod, requestedResult: result,
        value: input.value, normalRange: point.normalRange,
      });
    } catch (error: unknown) { return ERROR(error instanceof Error ? error.message : 'Invalid inspection value', 400); }

    if (evaluated.exceededLimit && !findings) {
      findings = 'Instrument reading ' + evaluated.value
        + ' outside acceptable range ('
        + (evaluated.range?.min ?? '—') + ' to ' + (evaluated.range?.max ?? '—')
        + ' ' + (evaluated.range?.unit || '') + ')';
    }
    if (isCorrectiveInspectionResult(evaluated.result) && !findings) {
      return ERROR('Findings are required when an inspection needs corrective work', 400);
    }

    // Atomic/idempotent record + draft corrective WO, serialized by part/point.
    const output = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', 'iassetspro:pm-inspection:' + pointId);
      const previous = await tx.componentInspectionRecord.findUnique({ where: { id: submissionId } });
      if (previous) {
        if (previous.inspectorId !== session.userId || previous.inspectionPointId !== pointId) {
          throw new Error('Inspection submission ID belongs to a different record');
        }
        return { record: previous, workOrder: null, replayed: true };
      }

      const inspectedAt = new Date();
      const record = await tx.componentInspectionRecord.create({
        data: {
          id: submissionId,
          componentId: assignment.componentId!,
          inspectionPointId: pointId,
          inspectorId: session.userId,
          inspectedAt,
          result: evaluated.result,
          value: evaluated.value,
          findings: findings || null,
          recommendation: recommendation || null,
        },
      });
      // Inspection does not complete the PM task and must not move next due.
      await tx.componentInspectionPoint.update({ where: { id: pointId }, data: { lastInspected: inspectedAt } });
      await tx.auditLog.create({
        data: {
          userId: session.userId, action: 'create', entityType: 'pm_inspection_record',
          entityId: record.id, plantId: assignment.asset.plantId,
          newValues: JSON.stringify({
            assignmentId, pointId, method: point.inspectionType, parameter: point.parameterKey,
            value: evaluated.value, normalRange: evaluated.range,
            exceededLimit: evaluated.exceededLimit, result: evaluated.result,
          }),
        },
      });

      let workOrder: { id: string; woNumber: string } | null = null;
      if (isCorrectiveInspectionResult(evaluated.result)) {
        const marker = '[pm-inspection-point:' + pointId + ']';
        workOrder = await tx.workOrder.findFirst({
          where: {
            assetId: assignment.assetId, plantId: assignment.asset.plantId,
            type: 'corrective', status: { notIn: CLOSED_WO_STATES },
            notes: { contains: marker },
          },
          select: { id: true, woNumber: true },
        });
        if (!workOrder) {
          const prefix = 'WO-' + inspectedAt.getFullYear()
            + String(inspectedAt.getMonth() + 1).padStart(2, '0');
          await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', 'iassetspro:pm-wo-number:' + prefix);
          const existingNumbers = await tx.workOrder.findMany({
            where: { woNumber: { startsWith: prefix } }, select: { woNumber: true },
          });
          const next = existingNumbers.reduce((highest, row) => {
            const value = Number.parseInt(row.woNumber.slice(prefix.length + 1), 10);
            return Number.isFinite(value) ? Math.max(value, highest) : highest;
          }, 0) + 1;
          const woNumber = prefix + '-' + String(next).padStart(4, '0');
          workOrder = await tx.workOrder.create({
            data: {
              woNumber,
              title: 'Inspection finding: ' + assignment.component!.name + ' · ' + point.name,
              description: 'Corrective work requested after ' + point.inspectionType
                + ' inspection of ' + assignment.asset.name + ' / ' + assignment.component!.name
                + '.\nOutcome: ' + evaluated.result + '\nReading: ' + (evaluated.value || 'N/A')
                + (evaluated.range?.unit ? ' ' + evaluated.range.unit : '')
                + '\nFindings: ' + findings + (recommendation ? '\nRecommendation: ' + recommendation : ''),
              type: 'corrective', priority: evaluated.result === 'fail' ? 'high' : 'medium',
              status: 'draft', assetId: assignment.assetId,
              assetName: assignment.asset.name,
              plantId: assignment.asset.plantId, departmentId: assignment.asset.departmentId,
              plannerId: session.userId,
              failureDescription: findings,
              notes: marker + ' [pm-assignment:' + assignmentId + ']',
            },
            select: { id: true, woNumber: true },
          });
          await tx.workOrderComponent.create({
            data: {
              workOrderId: workOrder.id, componentRegistryId: assignment.componentId!,
              notes: 'Linked from PM inspection point ' + point.name,
            },
          });
          await tx.workOrderTaskExecution.create({
            data: {
              workOrderId: workOrder.id, taskNumber: 1,
              description: 'Investigate and rectify inspection finding at ' + point.name,
              taskType: 'inspect', status: 'pending',
            },
          });
          await tx.auditLog.create({
            data: {
              userId: session.userId, action: 'create', entityType: 'work_order',
              entityId: workOrder.id, plantId: assignment.asset.plantId,
              newValues: JSON.stringify({ source: 'pm_inspection', recordId: record.id, assignmentId, pointId, woNumber }),
            },
          });
        }
        await tx.workOrderComment.create({
          data: {
            workOrderId: workOrder.id, userId: session.userId,
            content: 'Inspection ' + record.id + ' · ' + evaluated.result + ' · '
              + (evaluated.value || 'Visual check') + ' · ' + findings,
          },
        });
      }
      return { record, workOrder, replayed: false };
    });
    return NextResponse.json({ success: true, data: output }, { status: output.replayed ? 200 : 201 });
  } catch (error: unknown) {
    return ERROR(error instanceof Error ? error.message : 'Failed to record PM inspection', 500);
  }
}
