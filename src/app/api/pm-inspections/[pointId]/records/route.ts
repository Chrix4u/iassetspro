import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { evaluateInspectionResult, nextInspectionDate, parseInspectionLimits } from '@/lib/pm-inspection';
import { getAssetLiveLocationMap } from '@/lib/functional-location/live-location';
import { buildMaintenanceLocationSnapshot } from '@/lib/functional-location/maintenance-snapshot';
import { isSameInspectionSubmission, isPendingCorrectiveWorkOrder } from '@/lib/pm-inspection-submission';
import { resolveCorrectiveInspectionPlanner } from '@/services/pm/resolveCorrectiveInspectionPlanner.service';
import { mayAdvanceInspectionDue, parseInspectionCaptureEvidence, safeInspectionNextDue } from '@/lib/pm-paper-inspection-evidence';
import { validateManagedPaperReading, normalizeManagedPaperReference } from '@/lib/pm-paper-worksheet-validation';
import { createPlannerInspectionAlert, type PlannerInspectionAlert } from '@/lib/pm-inspection-planner-alert';
import { inspectionPurpose, inspectionMayAdvanceDue } from '@/lib/pm-early-field-inspection';
import { wsNotify } from '@/lib/ws-notify';

/**
 * Capture a part-level inspection, with an actual numeric instrument reading
 * or an explicit visual outcome. Failing checks generate a single draft
 * corrective WO per unresolved inspection point; planner dispatch is separate.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ pointId: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'pm_schedules.update')
      && !hasPermission(session, 'work_orders.update') && !hasPermission(session, 'digital_twin.manage')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to record an inspection' }, { status: 403 });
    }
    const { pointId } = await params;
    const point = await db.componentInspectionPoint.findUnique({
      where: { id: pointId },
      include: { component: { select: {
        id: true, name: true, componentCode: true, criticality: true,
        asset: { select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true } },
      } } },
    });
    if (!point || !point.isActive || !point.component.asset) {
      return NextResponse.json({ success: false, error: 'Active inspection point or parent machine not found' }, { status: 404 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess || !canAccessPlantStrict(scope, point.component.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    if (point.inspectionType !== 'visual' && point.inspectionType !== 'measurement') {
      return NextResponse.json({ success: false, error: 'Use sight or instrument inspection for this PM worksheet' }, { status: 400 });
    }
    const body = await request.json();
    // An absent state is legitimate for legacy worksheet captures. Never infer
    // Running/Standstill from a machine's current state for a historical record.
    const rawEquipmentState = body.equipmentState;
    if (rawEquipmentState !== undefined && rawEquipmentState !== null
      && rawEquipmentState !== 'running' && rawEquipmentState !== 'standstill') {
      return NextResponse.json({
        success: false, error: 'Invalid equipment state: choose Running or Standstill',
      }, { status: 400 });
    }
    const equipmentState: 'running' | 'standstill' | null = rawEquipmentState ?? null;
    const evidence = parseInspectionCaptureEvidence(body as Record<string, unknown>);
    if (evidence.paperReference) {
      evidence.paperReference = normalizeManagedPaperReference(evidence.paperReference);
    }
    const submissionKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
    if (submissionKey && !/^[a-zA-Z0-9_-]{8,120}$/.test(submissionKey)) {
      return NextResponse.json({ success: false, error: 'Invalid inspection submission key' }, { status: 400 });
    }
    const choice = body.outcome;
    if (!['pass', 'fail', 'needs_attention', 'not_measured'].includes(choice)) {
      return NextResponse.json({ success: false, error: 'Choose Normal, Needs Attention, Defect or Not Measurable' }, { status: 400 });
    }
    let purpose: 'routine' | 'early_check';
    try { purpose = inspectionPurpose(body.inspectionPurpose); }
    catch (cause) { return NextResponse.json({ success: false,
      error: cause instanceof Error ? cause.message : 'Invalid inspection purpose',
    }, { status: 400 }); }
    const notMeasured = choice === 'not_measured';
    let findings = typeof body.findings === 'string' ? body.findings.trim().slice(0, 3000) : '';
    if (notMeasured && (point.inspectionType !== 'measurement'
      || (body.value !== null && body.value !== undefined && String(body.value).trim() !== '')
      || findings.length < 10)) {
      return NextResponse.json({ success: false,
        error: 'Not measurable requires an instrument check, no numeric reading, and an explanation of at least 10 characters',
      }, { status: 400 });
    }
    const limits = parseInspectionLimits(point.normalRange);
    const inspection = notMeasured
      ? { value: null, numericValue: null, outcome: 'not_measured' as const, isAlarm: false }
      : evaluateInspectionResult(point.inspectionType, body.value, choice, limits);
    const recommendation = typeof body.recommendation === 'string' ? body.recommendation.trim().slice(0, 3000) : '';
    if (inspection.isAlarm && !findings && inspection.numericValue !== null) {
      findings = `Instrument reading ${inspection.value} ${limits.unit || ''} is outside the accepted range (${limits.min ?? '—'} to ${limits.max ?? '—'}).`;
    }
    if (inspection.isAlarm && !findings) {
      return NextResponse.json({ success: false, error: 'Describe the inspection defect or observation' }, { status: 400 });
    }
    if (point.inspectionType === 'measurement' && !point.parameterKey) {
      return NextResponse.json({ success: false, error: 'Measurement point has no parameter key' }, { status: 400 });
    }
    const asset = point.component.asset;
    if (evidence.captureSource === 'paper' && evidence.paperReference?.startsWith('IW-')) {
      const issue = await db.pmPaperWorksheetIssue.findUnique({
        where: { reference: evidence.paperReference },
        select: { reference: true, assetId: true, plantId: true, equipmentState: true,
          pointIds: true, issuedAt: true, purpose: true },
      });
      const invalid = validateManagedPaperReading(issue, {
        reference: evidence.paperReference, assetId: asset.id,
        plantId: asset.plantId, equipmentState, pointId,
        fieldInspectedAt: evidence.fieldInspectedAt,
      });
      if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });
      if (issue && body.inspectionPurpose !== undefined && purpose !== issue.purpose) {
        return NextResponse.json({ success: false,
          error: 'Inspection purpose differs from the issued worksheet', }, { status: 409 });
      }
      if (issue) purpose = inspectionPurpose(issue.purpose);
    }
    const location = await getAssetLiveLocationMap([asset.id]);
    const snapshot = buildMaintenanceLocationSnapshot(location.get(asset.id) ?? null);

    const outcome = await db.$transaction(async (tx) => {
      // This lock prevents repeated failed submissions creating parallel WOs.
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `iassetspro:pm-inspection:${pointId}`);
      // A mobile retry after an uncertain network response must never write
      // another inspection, condition reading or corrective work order.
      if (submissionKey) {
        const previous = await tx.componentInspectionRecord.findUnique({
          where: { requestKey: submissionKey },
          include: { workOrder: { select: { id: true, woNumber: true, status: true } } },
        });
        if (previous) {
          if (!isSameInspectionSubmission(previous, {
            inspectionPointId: pointId,
            inspectorId: session.userId,
            result: inspection.outcome,
            value: inspection.value,
            findings: findings || null,
            recommendation: recommendation || null,
            equipmentState,
            ...evidence,
            inspectionPurpose: purpose,
          })) {
            throw new Error('Inspection submission key conflict');
          }
          // A later verified closeout must not be presented as still pending.
          const previousOpen = isPendingCorrectiveWorkOrder(previous.workOrder) ? previous.workOrder : null;
          const outstanding = previousOpen || (await tx.componentInspectionRecord.findFirst({
            where: {
              inspectionPointId: pointId,
              workOrder: { is: { type: 'corrective', status: { notIn: ['closed', 'cancelled'] } } },
            },
            orderBy: { inspectedAt: 'desc' },
            select: { workOrder: { select: { id: true, woNumber: true, status: true } } },
          }))?.workOrder || null;
          return {
            record: previous,
            workOrder: outstanding,
            reusedWorkOrder: Boolean(outstanding),
            nextInspection: null,
            awaitingCloseout: Boolean(outstanding),
            plannerAlert: null as PlannerInspectionAlert | null,
            duplicate: true,
          };
        }
      }
      const refreshedPoint = await tx.componentInspectionPoint.findUnique({
        where: { id: pointId }, select: { isActive: true, frequency: true, nextInspection: true, lastInspected: true },
      });
      if (!refreshedPoint?.isActive) throw new Error('Inspection point was deactivated');
      const inspectedAt = new Date(); // server timestamp when entered
      const observedAt = evidence.fieldInspectedAt || inspectedAt; // actual field reading time
      const mayAdvanceDue = mayAdvanceInspectionDue(refreshedPoint.lastInspected, observedAt);
      const record = await tx.componentInspectionRecord.create({
        data: {
          inspectionPointId: pointId,
          componentId: point.component.id,
          requestKey: submissionKey || null,
          value: inspection.value,
          result: inspection.outcome,
          findings: findings || null,
          recommendation: recommendation || null,
          inspectorId: session.userId,
          inspectedAt,
          equipmentState,
          ...evidence,
          inspectionPurpose: purpose,
        },
      });
      if (inspection.numericValue !== null) {
        await tx.componentConditionReading.create({
          data: {
            componentId: point.component.id,
            parameterKey: point.parameterKey!,
            value: inspection.numericValue,
            unit: limits.unit || 'unit',
            quality: 100,
            minThreshold: limits.min,
            maxThreshold: limits.max,
            isAlarm: inspection.isAlarm,
            source: 'manual',
            recordedAt: observedAt,
            recordedById: session.userId,
          },
        });
      }

      // A later passing re-inspection must not prematurely clear an existing
      // corrective WO. Only verified planner closeout can release that due cycle.
      const outstanding = await tx.componentInspectionRecord.findFirst({
        where: {
          inspectionPointId: pointId,
          workOrder: { is: { type: 'corrective', status: { notIn: ['closed', 'cancelled'] } } },
        },
        orderBy: { inspectedAt: 'desc' },
        select: { workOrder: { select: { id: true, woNumber: true, status: true } } },
      });
      let workOrder: { id: string; woNumber: string; status: string } | null = outstanding?.workOrder || null;
      let reusedWorkOrder = Boolean(workOrder);
      let nextInspection: Date | null = null;
      let plannerAlert: PlannerInspectionAlert | null = null;
      if (notMeasured || !inspectionMayAdvanceDue(purpose, inspection.outcome)) {
        // A missed instrument test or early observation is evidence only:
        // it never creates a false numeric reading, closes a WO, or moves due dates.
      } else if (!inspection.isAlarm && !workOrder) {
        if (mayAdvanceDue) {
          const computedNext = nextInspectionDate(observedAt, refreshedPoint.frequency);
          if (!computedNext) throw new Error('Unsupported inspection recurrence; update the inspection plan');
          nextInspection = safeInspectionNextDue(
            computedNext, refreshedPoint.nextInspection, evidence.captureSource,
          );
          await tx.componentInspectionPoint.update({
            where: { id: pointId }, data: { lastInspected: observedAt, nextInspection },
          });
        }
        // Old paper PASS must never rewind a newer PM cycle.
      } else if (!inspection.isAlarm) {
        // Later PASS must never clear an open corrective work order.
        if (mayAdvanceDue) await tx.componentInspectionPoint.update({
          where: { id: pointId }, data: { lastInspected: observedAt },
        });
      } else {
        // A failed inspection does not reset due date. Its corrective WO must be
        // technician-completed, verified and planner-closed before resetting it.
        if (workOrder) {
          reusedWorkOrder = true;
        } else {
          const prefix = `WO-${inspectedAt.getFullYear()}${String(inspectedAt.getMonth() + 1).padStart(2, '0')}`;
          await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `iassetspro:pm-wo-number:${prefix}`);
          const numberRows = await tx.workOrder.findMany({
            where: { woNumber: { startsWith: prefix } }, select: { woNumber: true },
          });
          const highest = numberRows.reduce((max, item) => {
            const n = Number.parseInt(item.woNumber.slice(prefix.length + 1), 10);
            return Number.isFinite(n) ? Math.max(max, n) : max;
          }, 0);
          const woNumber = `${prefix}-${String(highest + 1).padStart(4, '0')}`;
          // Technician inspection evidence creates a draft for the plant's
          // authorized planner; the technician must never become the planner.
          const plannerId = await resolveCorrectiveInspectionPlanner(tx, asset.plantId);
          const created = await tx.workOrder.create({
            data: {
              woNumber,
              title: `Inspection follow-up: ${point.component.name} / ${point.name}`,
              description: [
                `Failed ${point.inspectionType === 'visual' ? 'sight' : 'instrument'} inspection on ${asset.name}, part ${point.component.name} (${point.component.componentCode}).`,
                `Inspection: ${point.name}`,
                inspection.value !== null ? `Recorded value: ${inspection.value} ${limits.unit || ''}` : '',
                `Result: ${inspection.outcome}`,
                `Findings: ${findings}`,
                evidence.captureSource === 'paper'
                  ? `Paper worksheet ${evidence.paperReference}; physically checked by ${evidence.fieldInspectorName} at ${observedAt.toISOString()}; entered at ${inspectedAt.toISOString()}.`
                  : '',
                recommendation ? `Recommendation: ${recommendation}` : '',
              ].filter(Boolean).join('\n'),
              type: 'corrective',
              priority: inspection.outcome === 'fail' || point.component.criticality === 'critical' ? 'high' : 'medium',
              status: 'draft',
              plannerId,
              assetId: asset.id,
              assetName: asset.name,
              departmentId: asset.departmentId,
              plantId: asset.plantId,
              failureDescription: findings,
              ...snapshot,
              notes: `Automatically drafted from inspection record ${record.id}. ${plannerId
                ? 'Assigned to the plant planner for review and execution assignment.'
                : 'No eligible active plant planner found; maintenance management intervention is required to establish accountable ownership before execution.'}`,
            },
          });
          await tx.workOrderComponent.upsert({
            where: { workOrderId_componentRegistryId: { workOrderId: created.id, componentRegistryId: point.component.id } },
            create: { workOrderId: created.id, componentRegistryId: point.component.id, notes: 'Inspection defect source' },
            update: {},
          });
          await tx.componentInspectionRecord.update({
            where: { id: record.id }, data: { workOrderId: created.id },
          });
          workOrder = { id: created.id, woNumber: created.woNumber, status: created.status };
          await tx.auditLog.create({
            data: {
              userId: session.userId, action: 'create', entityType: 'work_order', entityId: created.id,
              plantId: asset.plantId,
              newValues: JSON.stringify({ woNumber, inspectionPointId: pointId, inspectionRecordId: record.id, status: 'draft', plannerId, plannerAssignment: plannerId ? 'plant_planner' : 'management_attention_required', reason: 'failed_inspection' }),
            },
          });
          // Persist the alert with the draft WO in the SAME transaction.
          // No SMS or external email is sent automatically; the planner can
          // review through existing in-app and WebSocket notifications.
          const alert = createPlannerInspectionAlert({
            plannerId, workOrderId: created.id, woNumber, assetName: asset.name,
            partCode: point.component.componentCode, inspectionName: point.name,
            equipmentState, result: inspection.outcome as 'fail' | 'needs_attention',
            reading: inspection.value, unit: limits.unit,
          });
          if (alert) {
            await tx.notification.create({ data: alert });
            plannerAlert = alert;
          }
        }
        if (mayAdvanceDue) await tx.componentInspectionPoint.update({
          where: { id: pointId }, data: { lastInspected: observedAt },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId, action: 'create', entityType: 'component_inspection_record', entityId: record.id,
          plantId: asset.plantId,
          newValues: JSON.stringify({
            inspectionPointId: pointId, componentId: point.component.id, method: point.inspectionType,
            value: inspection.value, unit: limits.unit, result: inspection.outcome,
            equipmentState, captureSource: evidence.captureSource,
            fieldInspectedAt: evidence.fieldInspectedAt?.toISOString() || null,
            fieldInspectorName: evidence.fieldInspectorName,
            paperReference: evidence.paperReference,
            enteredAt: inspectedAt.toISOString(),
            dueCycleUpdated: mayAdvanceDue && !inspection.isAlarm && !workOrder,
            findings, workOrderId: workOrder?.id || null, reusedWorkOrder, nextInspection,
          }),
        },
      });
      return { record, workOrder, reusedWorkOrder, nextInspection,
        awaitingCloseout: Boolean(workOrder), plannerAlert };
    });
    const { plannerAlert, ...responseData } = outcome;
    if (plannerAlert) {
      // Post-commit live push is best-effort; persistent in-app notification
      // has already committed atomically with the draft WO.
      try {
        await wsNotify(plannerAlert.userId, 'notification', { ...plannerAlert });
      } catch (error) {
        console.error('[PM inspection] Planner WebSocket notification failed:', error);
      }
    }
    return NextResponse.json({ success: true, data: responseData }, { status: 'duplicate' in outcome ? 200 : 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record PM inspection';
    const clientError = /invalid|require|select|unsupported|deactivated|defect|observation|field inspector|worksheet|paper|future|date and time/i.test(message);
    return NextResponse.json({ success: false, error: message }, { status: message === 'Inspection submission key conflict' ? 409 : clientError ? 400 : 500 });
  }
}
