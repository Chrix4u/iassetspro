import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { getAssetLiveLocationMap } from '@/lib/functional-location/live-location';
import { findOpenRuntimeGeneratedWorkOrder, normalizePmTriggerConfig, parsePmTriggerConfig } from '@/services/pm/triggerConfig.service';
import { calculateNextDueDate, isPmFrequencyType } from '@/lib/pm-utils';
import { isCanonicalPmFrequencyType, normalizePmFrequency, validateCanonicalPmFrequency } from '@/lib/pm-frequency';
import { lockPmScheduleLifecycle, lockPmTemplateLifecycle } from '@/services/pm/templateLifecycle.service';
import { createPmScheduleTaskSnapshot, normalizePmScheduleTasks } from '@/services/pm/scheduleTaskSnapshot.service';
import { resolvePmTemplateTasks } from '@/services/pm/resolvePmTemplateTasks.service';
import { PmScheduleTaskValidationError, normalizePmScheduledTasks, syncPmScheduledTasks } from '@/services/pm/pmScheduleTask.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    const schedule = await db.pmSchedule.findUnique({
      where: { id },
      include: {
        asset: {
          select: { id: true, name: true, assetTag: true, status: true, criticality: true, plantId: true },
        },
        component: {
          select: { id: true, name: true, componentCode: true, componentType: true, parentId: true, assetId: true },
        },
        assignedTo: { select: { id: true, fullName: true, username: true } },
        department: { select: { id: true, name: true, code: true } },
        template: { select: { id: true, title: true, type: true, category: true, tasks: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { taskNumber: 'asc' }, { id: 'asc' }], include: { pmTask: true } }, _count: { select: { tasks: { where: { isActive: true } } } } } },
        createdBy: { select: { id: true, fullName: true, username: true } },
        tasks: { where: { isActive: true }, include: { pmTask: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: 'PM schedule not found' },
        { status: 404 }
      );
    }
    if (!canAccessPlantStrict(plantScope, schedule.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const liveLocations = await getAssetLiveLocationMap([schedule.asset.id]);
    const resolvedTemplate = schedule.template
      ? { ...schedule.template, tasks: resolvePmTemplateTasks(schedule.template.tasks) }
      : null;
    return NextResponse.json({
      success: true,
      data: {
        ...schedule,
        scheduledTasks: schedule.tasks,
        template: resolvedTemplate,
        asset: {
          ...schedule.asset,
          functionalLocation: liveLocations.get(schedule.asset.id) ?? null,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM schedule';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const body = await request.json();
    const scheduledTasksProvided = body.scheduledTasks !== undefined;
    if (scheduledTasksProvided && body.inlineTasks !== undefined) {
      return NextResponse.json(
        { success: false, error: 'Task-level Scheduled Tasks cannot be combined with legacy inline task snapshots' },
        { status: 400 },
      );
    }
    const normalizedScheduledTasks = scheduledTasksProvided ? normalizePmScheduledTasks(body.scheduledTasks) : null;
    if (normalizedScheduledTasks && !normalizedScheduledTasks.ok) {
      return NextResponse.json({ success: false, error: normalizedScheduledTasks.error }, { status: 400 });
    }
    const inlineTasksProvided = body.inlineTasks !== undefined;
    const normalizedInlineTasksResult = inlineTasksProvided ? normalizePmScheduleTasks(body.inlineTasks) : null;
    if (normalizedInlineTasksResult && !normalizedInlineTasksResult.ok) {
      return NextResponse.json({ success: false, error: normalizedInlineTasksResult.error }, { status: 400 });
    }
    const normalizedInlineTasks = normalizedInlineTasksResult?.ok ? normalizedInlineTasksResult.tasks : [];
    const requestedFields = Object.keys(body).filter((field) => body[field] !== undefined);
    const isActivationOnly = requestedFields.length === 1
      && requestedFields[0] === 'isActive'
      && body.isActive === true;
    const canUpdateSchedule = hasPermission(session, 'pm_schedules.update')
      || hasPermission(session, 'work_orders.update')
      || isAdmin(session);
    const canActivateSchedule = isActivationOnly && hasPermission(session, 'pm_schedules.activate');
    if (!canUpdateSchedule && !canActivateSchedule) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.pmSchedule.findUnique({
      where: { id },
      include: {
        asset: { select: { plantId: true } },
        trigger: {
          select: { id: true, triggerType: true, triggerValue: true, triggerConfig: true, isActive: true },
        },
        tasks: { take: 1, select: { id: true } },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'PM schedule not found' },
        { status: 404 }
      );
    }
    if (!canAccessPlantStrict(plantScope, existing.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const existingHasTaskAuthority = existing.recurrenceAuthority === 'task';
    const prospectiveTaskLevel = existingHasTaskAuthority || scheduledTasksProvided;
    const legacyRecurrenceFields = ['frequencyType', 'frequencyValue', 'frequencyUnit', 'meterName', 'lastCompletedDate', 'nextDueDate', 'leadDays'];
    if (existingHasTaskAuthority && inlineTasksProvided) {
      return NextResponse.json(
        { success: false, error: 'Existing task-level Scheduled Tasks cannot be combined with legacy inline task snapshots' },
        { status: 400 },
      );
    }
    if (prospectiveTaskLevel && legacyRecurrenceFields.some((field) => body[field] !== undefined)) {
      return NextResponse.json(
        { success: false, error: 'Task-level recurrence is configured on Scheduled Tasks, not legacy schedule header fields' },
        { status: 400 },
      );
    }
    const requestedComponentId = body.componentId !== undefined ? (body.componentId || null) : existing.componentId;
    if (existingHasTaskAuthority && body.componentId !== undefined && requestedComponentId !== existing.componentId && !scheduledTasksProvided) {
      return NextResponse.json(
        { success: false, error: 'Changing a task-level PM target requires Scheduled Tasks to be resubmitted for source revalidation' },
        { status: 400 },
      );
    }

    const existingNormalizedFrequency = normalizePmFrequency(existing);
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'title', 'description', 'lastCompletedDate', 'nextDueDate',
      'estimatedDuration', 'priority', 'assignedToId', 'departmentId',
      'isActive', 'autoGenerateWO', 'leadDays', 'woTypeId', 'componentId', 'templateId',
    ];

    for (const field of allowedFields) {
      if (body[field] === undefined) continue;
      if (field === 'lastCompletedDate' || field === 'nextDueDate') {
        // Frequency edits own nextDueDate below so they can derive a new due date
        // when the planner changes interval/unit without entering a manual date.
        if (field === 'nextDueDate') continue;
        const rawDate = body[field];
        const isBlankDate = rawDate === null
          || (typeof rawDate === 'string' && rawDate.trim() === '');
        if (isBlankDate) {
          updateData[field] = null;
        } else {
          const normalizedDate = new Date(rawDate);
          if (Number.isNaN(normalizedDate.getTime())) {
            return NextResponse.json(
              { success: false, error: 'Last completed date must be a valid date' },
              { status: 400 },
            );
          }
          updateData[field] = normalizedDate;
        }
      } else if (field === 'componentId' || field === 'templateId' || field === 'assignedToId' || field === 'departmentId' || field === 'woTypeId') {
        updateData[field] = body[field] || null;
      } else {
        updateData[field] = body[field];
      }
    }

    if (body.leadDays !== undefined) {
      const normalizedLeadDays = typeof body.leadDays === 'number' || typeof body.leadDays === 'string'
        ? Number(body.leadDays)
        : Number.NaN;
      const isBlankLeadDays = typeof body.leadDays === 'string' && body.leadDays.trim() === '';
      if (isBlankLeadDays || !Number.isInteger(normalizedLeadDays) || normalizedLeadDays < 0) {
        return NextResponse.json(
          { success: false, error: 'Lead days must be a non-negative whole number' },
          { status: 400 },
        );
      }
      updateData.leadDays = normalizedLeadDays;
    }

    if (body.estimatedDuration !== undefined) {
      const rawEstimatedDuration = body.estimatedDuration === null
        || (typeof body.estimatedDuration === 'string' && body.estimatedDuration.trim() === '')
        ? 0
        : body.estimatedDuration;
      const normalizedEstimatedDuration = typeof rawEstimatedDuration === 'number' || typeof rawEstimatedDuration === 'string'
        ? Number(rawEstimatedDuration)
        : Number.NaN;
      if (!Number.isFinite(normalizedEstimatedDuration) || normalizedEstimatedDuration < 0) {
        return NextResponse.json(
          { success: false, error: 'Estimated duration must be a non-negative number of hours' },
          { status: 400 },
        );
      }
      updateData.estimatedDuration = normalizedEstimatedDuration;
    }

    const prospectiveComponentId = body.componentId !== undefined
      ? (body.componentId || null)
      : existing.componentId;
    if (prospectiveComponentId) {
      const component = await db.componentRegistry.findUnique({
        where: { id: prospectiveComponentId },
        select: { id: true, assetId: true },
      });
      if (!component) {
        return NextResponse.json({ success: false, error: 'Component not found' }, { status: 400 });
      }
      if (component.assetId !== existing.assetId) {
        return NextResponse.json(
          { success: false, error: 'Selected component does not belong to the PM schedule asset' },
          { status: 400 },
        );
      }
    }

    const frequencyFieldsChanging = ['frequencyType', 'frequencyValue', 'frequencyUnit', 'meterName']
      .some((field) => body[field] !== undefined);
    let canonicalFrequencyForUpdate: ReturnType<typeof normalizePmFrequency> | null = null;
    let storedFrequencyTypeForUpdate: string | null = null;
    let storedFrequencyUnitForUpdate: string | null = null;
    let storedMeterNameForUpdate: string | null = null;

    if (frequencyFieldsChanging) {
      const rawFrequencyType = body.frequencyType !== undefined ? body.frequencyType : existing.frequencyType;
      if (!isPmFrequencyType(rawFrequencyType)) {
        return NextResponse.json({ success: false, error: 'Invalid PM frequency type' }, { status: 400 });
      }
      const rawFrequencyValue = body.frequencyValue !== undefined ? body.frequencyValue : existing.frequencyValue;
      const normalizedFrequencyValue = Number(rawFrequencyValue);
      if (!Number.isInteger(normalizedFrequencyValue) || normalizedFrequencyValue <= 0) {
        return NextResponse.json({ success: false, error: 'Frequency value must be a positive whole number' }, { status: 400 });
      }

      const rawFrequencyUnit = body.frequencyUnit !== undefined ? body.frequencyUnit : existing.frequencyUnit;
      const rawMeterName = body.meterName !== undefined ? body.meterName : existing.meterName;
      if (
        body.frequencyType !== undefined
        && body.frequencyType !== existing.frequencyType
        && isCanonicalPmFrequencyType(rawFrequencyType)
        && body.frequencyUnit === undefined
      ) {
        return NextResponse.json(
          { success: false, error: 'Frequency unit is required when changing frequency type' },
          { status: 400 },
        );
      }
      if (isCanonicalPmFrequencyType(rawFrequencyType)) {
        const rawFrequencyValidation = validateCanonicalPmFrequency({
          frequencyType: rawFrequencyType,
          frequencyValue: normalizedFrequencyValue,
          frequencyUnit: rawFrequencyUnit,
          meterName: rawMeterName,
        });
        if (!rawFrequencyValidation.ok) {
          return NextResponse.json({ success: false, error: rawFrequencyValidation.error }, { status: 400 });
        }
      }

      canonicalFrequencyForUpdate = normalizePmFrequency({
        frequencyType: rawFrequencyType,
        frequencyValue: normalizedFrequencyValue,
        frequencyUnit: rawFrequencyUnit,
        meterName: rawMeterName,
      });
      const legacyComponentUsage = ['meter_based'].includes(rawFrequencyType)
        && !canonicalFrequencyForUpdate.meterName
        && Boolean(prospectiveComponentId);

      if (!legacyComponentUsage && !isCanonicalPmFrequencyType(rawFrequencyType)) {
        const frequencyValidation = validateCanonicalPmFrequency(canonicalFrequencyForUpdate);
        if (!frequencyValidation.ok) {
          return NextResponse.json({ success: false, error: frequencyValidation.error }, { status: 400 });
        }
      }

      if (canonicalFrequencyForUpdate.frequencyType === 'meter' && canonicalFrequencyForUpdate.meterName) {
        const selectedMeter = await db.meterReading.findFirst({
          where: {
            assetId: existing.assetId,
            meterName: canonicalFrequencyForUpdate.meterName,
            unit: canonicalFrequencyForUpdate.frequencyUnit,
          },
          orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
          select: { id: true },
        });
        if (!selectedMeter) {
          return NextResponse.json(
            { success: false, error: 'Selected meter has no reading for this asset' },
            { status: 400 },
          );
        }
      } else if (canonicalFrequencyForUpdate.frequencyType === 'meter' && !legacyComponentUsage) {
        return NextResponse.json(
          { success: false, error: 'Meter frequency requires a configured asset meter and unit' },
          { status: 400 },
        );
      }

      storedFrequencyTypeForUpdate = legacyComponentUsage
        ? rawFrequencyType
        : canonicalFrequencyForUpdate.frequencyType;
      storedFrequencyUnitForUpdate = legacyComponentUsage ? null : canonicalFrequencyForUpdate.frequencyUnit;
      storedMeterNameForUpdate = legacyComponentUsage ? null : canonicalFrequencyForUpdate.meterName;
      updateData.frequencyType = storedFrequencyTypeForUpdate;
      updateData.frequencyValue = canonicalFrequencyForUpdate.frequencyValue;
      updateData.frequencyUnit = storedFrequencyUnitForUpdate;
      updateData.meterName = storedMeterNameForUpdate;

      if (canonicalFrequencyForUpdate.frequencyType === 'meter') {
        updateData.nextDueDate = null;
        updateData.leadDays = 0;
      } else {
        let requestedNextDueDate: Date | null = null;
        if (body.nextDueDate !== undefined && body.nextDueDate !== null && String(body.nextDueDate).trim() !== '') {
          requestedNextDueDate = new Date(body.nextDueDate);
          if (Number.isNaN(requestedNextDueDate.getTime())) {
            return NextResponse.json(
              { success: false, error: 'Next due date must be a valid date' },
              { status: 400 },
            );
          }
        }
        const effectiveLastCompleted = updateData.lastCompletedDate instanceof Date
          ? updateData.lastCompletedDate
          : existing.lastCompletedDate;
        updateData.nextDueDate = requestedNextDueDate ?? calculateNextDueDate(
          effectiveLastCompleted ?? new Date(),
          canonicalFrequencyForUpdate.frequencyType,
          canonicalFrequencyForUpdate.frequencyValue,
          canonicalFrequencyForUpdate.frequencyUnit,
        );
      }
    } else if (existingNormalizedFrequency.frequencyType === 'meter') {
      // Partial API edits must not reintroduce calendar state onto usage-based PM.
      if (body.nextDueDate !== undefined) updateData.nextDueDate = null;
      if (body.leadDays !== undefined) updateData.leadDays = 0;
    } else if (body.nextDueDate !== undefined) {
      const rawDate = body.nextDueDate;
      const isBlankDate = rawDate === null || (typeof rawDate === 'string' && rawDate.trim() === '');
      if (isBlankDate) {
        updateData.nextDueDate = null;
      } else {
        const normalizedDate = new Date(rawDate);
        if (Number.isNaN(normalizedDate.getTime())) {
          return NextResponse.json(
            { success: false, error: 'Next due date must be a valid date' },
            { status: 400 },
          );
        }
        updateData.nextDueDate = normalizedDate;
      }
    }

    const updateResult = await db.$transaction(async (tx) => {
      await lockPmScheduleLifecycle(tx, id);
      const lockedSchedule = await tx.pmSchedule.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          description: true,
          estimatedDuration: true,
          priority: true,
          isActive: true,
          templateId: true,
          componentId: true,
          frequencyType: true,
          frequencyValue: true,
          frequencyUnit: true,
          meterName: true,
          recurrenceAuthority: true,
          assetId: true,
          asset: { select: { plantId: true } },
          trigger: {
            select: {
              id: true,
              isActive: true,
              triggerType: true,
              triggerValue: true,
              triggerConfig: true,
            },
          },
          tasks: { take: 1, select: { id: true } },
        },
      });
      if (!lockedSchedule) return { kind: 'not_found' as const };

      const lockedHasTaskAuthority = lockedSchedule.recurrenceAuthority === 'task';
      const lockedProspectiveTaskLevel = lockedHasTaskAuthority || scheduledTasksProvided;
      if (lockedHasTaskAuthority && inlineTasksProvided) {
        return { kind: 'task_level_conflict' as const, error: 'Existing task-level Scheduled Tasks cannot be combined with legacy inline task snapshots' };
      }
      if (lockedProspectiveTaskLevel && legacyRecurrenceFields.some((field) => body[field] !== undefined)) {
        return { kind: 'task_level_conflict' as const, error: 'Task-level recurrence is configured on Scheduled Tasks, not legacy schedule header fields' };
      }
      if (lockedHasTaskAuthority && body.componentId !== undefined && (body.componentId || null) !== lockedSchedule.componentId && !scheduledTasksProvided) {
        return { kind: 'task_level_conflict' as const, error: 'Changing a task-level PM target requires Scheduled Tasks to be resubmitted for source revalidation' };
      }

      const lockedUpdateData: Record<string, unknown> = {
        ...updateData,
        ...(scheduledTasksProvided ? { recurrenceAuthority: 'task', lastCompletedDate: null, nextDueDate: null } : {}),
      };
      const lockedProspectiveFrequencyType = storedFrequencyTypeForUpdate ?? lockedSchedule.frequencyType;
      const lockedProspectiveFrequencyValue = canonicalFrequencyForUpdate?.frequencyValue ?? Number(lockedSchedule.frequencyValue);
      const lockedProspectiveFrequencyUnit = frequencyFieldsChanging
        ? storedFrequencyUnitForUpdate
        : lockedSchedule.frequencyUnit;
      const lockedProspectiveMeterName = frequencyFieldsChanging
        ? storedMeterNameForUpdate
        : lockedSchedule.meterName;
      const lockedProspectiveComponentId = body.componentId !== undefined
        ? (body.componentId || null)
        : lockedSchedule.componentId;
      const lockedNormalizedProspectiveFrequency = normalizePmFrequency({
        frequencyType: lockedProspectiveFrequencyType,
        frequencyValue: lockedProspectiveFrequencyValue,
        frequencyUnit: lockedProspectiveFrequencyUnit,
        meterName: lockedProspectiveMeterName,
      });

      const lockedTriggerTargetChanged = body.componentId !== undefined || frequencyFieldsChanging;
      const lockedTriggerConfig = lockedSchedule.trigger
        ? parsePmTriggerConfig(lockedSchedule.trigger.triggerConfig)
        : {};
      if (lockedSchedule.trigger?.isActive && lockedTriggerTargetChanged) {
        const lockedOpenGeneratedWork = await findOpenRuntimeGeneratedWorkOrder(
          lockedTriggerConfig,
          lockedSchedule.id,
          tx,
        );
        if (lockedOpenGeneratedWork) {
          return { kind: 'open_work' as const, openGeneratedWork: lockedOpenGeneratedWork };
        }
      }

      let triggerMutation: 'create' | 'update' | 'delete' | null = null;
      let reconciledTriggerConfig: string | undefined;
      let reconciledTriggerValue: number | undefined;

      if (scheduledTasksProvided && lockedSchedule.trigger) {
        // Explicit Scheduled Task submission transfers recurrence authority away
        // from the legacy trigger subsystem in the same transaction.
        triggerMutation = 'delete';
      } else if (lockedTriggerTargetChanged) {
        const prospectiveSchedule = {
          id: lockedSchedule.id,
          assetId: lockedSchedule.assetId,
          componentId: lockedProspectiveComponentId,
          frequencyType: lockedProspectiveFrequencyType,
          frequencyUnit: lockedProspectiveFrequencyUnit,
          meterName: lockedProspectiveMeterName,
          asset: { plantId: lockedSchedule.asset.plantId },
        };

        if (lockedNormalizedProspectiveFrequency.frequencyType === 'meter') {
          if (lockedSchedule.trigger && lockedSchedule.trigger.triggerType !== 'meter') {
            return {
              kind: 'trigger_conflict' as const,
              error: 'Meter schedules require the schedule meter trigger; deactivate or remove the existing condition/production trigger first',
            };
          }
          const normalized = await normalizePmTriggerConfig({
            triggerType: 'meter',
            triggerValue: lockedProspectiveFrequencyValue,
            triggerConfig: lockedTriggerConfig,
            schedule: prospectiveSchedule,
            existingConfig: lockedTriggerConfig,
          });
          if (normalized.error || !normalized.config) {
            return {
              kind: 'trigger_conflict' as const,
              error: normalized.error || 'invalid meter trigger configuration',
            };
          }
          reconciledTriggerConfig = JSON.stringify(normalized.config);
          reconciledTriggerValue = lockedProspectiveFrequencyValue;
          triggerMutation = lockedSchedule.trigger ? 'update' : 'create';
        } else if (lockedSchedule.trigger?.triggerType === 'meter' && frequencyFieldsChanging) {
          triggerMutation = 'delete';
        } else if (lockedSchedule.trigger) {
          const normalized = await normalizePmTriggerConfig({
            triggerType: lockedSchedule.trigger.triggerType,
            triggerValue: lockedSchedule.trigger.triggerValue,
            triggerConfig: lockedTriggerConfig,
            schedule: prospectiveSchedule,
            existingConfig: lockedTriggerConfig,
          });
          if (normalized.error || !normalized.config) {
            return {
              kind: 'trigger_conflict' as const,
              error: normalized.error || 'invalid trigger configuration',
            };
          }
          reconciledTriggerConfig = JSON.stringify(normalized.config);
          reconciledTriggerValue = lockedSchedule.trigger.triggerValue;
          triggerMutation = 'update';
        }
      }

      const effectiveIsActive = body.isActive !== undefined
        ? body.isActive === true
        : lockedSchedule.isActive;
      const effectiveTemplateId = body.templateId !== undefined
        ? (body.templateId || null)
        : lockedSchedule.templateId;

      // Preserve the existing shared-template lifecycle contract for callers
      // that are not replacing the checklist with schedule-owned inline tasks.
      if (!inlineTasksProvided) {
        if (effectiveIsActive && effectiveTemplateId) {
          await lockPmTemplateLifecycle(tx, effectiveTemplateId);
          const template = await tx.pmTemplate.findUnique({
            where: { id: effectiveTemplateId },
            select: {
              id: true,
              plantId: true,
              isActive: true,
              tasks: { where: { isActive: true }, take: 1, select: { id: true } },
            },
          });
          if (!template || !template.isActive || template.tasks.length === 0) {
            return { kind: 'invalid_template' as const };
          }
          if ((lockedHasTaskAuthority || scheduledTasksProvided) && template.plantId !== lockedSchedule.asset.plantId) {
            return { kind: 'invalid_template_plant' as const };
          }
        }
      }

      if (inlineTasksProvided) {
        const scheduleSnapshotTemplateId = normalizedInlineTasks.length > 0
          ? await createPmScheduleTaskSnapshot(tx, {
              scheduleTitle: String(lockedUpdateData.title || lockedSchedule.title),
              scheduleDescription: typeof lockedUpdateData.description === 'string'
                ? lockedUpdateData.description
                : lockedSchedule.description,
              estimatedDurationHours: typeof lockedUpdateData.estimatedDuration === 'number'
                ? lockedUpdateData.estimatedDuration
                : lockedSchedule.estimatedDuration,
              priority: typeof lockedUpdateData.priority === 'string'
                ? lockedUpdateData.priority
                : lockedSchedule.priority,
              createdById: session.userId,
              plantId: lockedSchedule.asset.plantId,
              tasks: normalizedInlineTasks,
            })
          : null;
        lockedUpdateData.templateId = scheduleSnapshotTemplateId;
      }

      const nextSchedule = await tx.pmSchedule.update({
        where: { id },
        data: lockedUpdateData,
        include: {
          asset: { select: { id: true, name: true, assetTag: true, status: true } },
          component: { select: { id: true, name: true, componentCode: true, componentType: true, parentId: true, assetId: true } },
          assignedTo: { select: { id: true, fullName: true, username: true } },
          department: { select: { id: true, name: true, code: true } },
          template: { select: { id: true, title: true, type: true, _count: { select: { tasks: { where: { isActive: true } } } } } },
          createdBy: { select: { id: true, fullName: true, username: true } },
        },
      });

      if (triggerMutation === 'delete' && lockedSchedule.trigger) {
        await tx.pmTrigger.delete({ where: { id: lockedSchedule.trigger.id } });
      } else if (triggerMutation === 'update' && lockedSchedule.trigger && reconciledTriggerConfig !== undefined) {
        await tx.pmTrigger.update({
          where: { id: lockedSchedule.trigger.id },
          data: {
            triggerConfig: reconciledTriggerConfig,
            ...(reconciledTriggerValue !== undefined ? { triggerValue: reconciledTriggerValue } : {}),
          },
        });
      } else if (triggerMutation === 'create' && reconciledTriggerConfig !== undefined && reconciledTriggerValue !== undefined) {
        await tx.pmTrigger.create({
          data: {
            scheduleId: lockedSchedule.id,
            triggerType: 'meter',
            triggerValue: reconciledTriggerValue,
            triggerConfig: reconciledTriggerConfig,
            isActive: true,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'pm_schedule',
          entityId: id,
          oldValues: JSON.stringify({
            title: lockedSchedule.title,
            componentId: lockedSchedule.componentId,
            frequencyType: lockedSchedule.frequencyType,
            frequencyValue: lockedSchedule.frequencyValue,
            frequencyUnit: lockedSchedule.frequencyUnit,
            meterName: lockedSchedule.meterName,
          }),
          newValues: JSON.stringify({
            ...lockedUpdateData,
            ...(triggerMutation ? { triggerMutation, reconciledTriggerValue } : {}),
          }),
        },
      });

      const taskRows = scheduledTasksProvided
        ? await syncPmScheduledTasks(tx, {
            scheduleId: id,
            plantId: lockedSchedule.asset.plantId,
            assetId: lockedSchedule.assetId,
            componentId: lockedProspectiveComponentId,
            tasks: body.scheduledTasks,
          })
        : [];

      return { kind: 'updated' as const, nextSchedule: { ...nextSchedule, ...(scheduledTasksProvided ? { scheduledTasks: taskRows } : {}) } };
    });

    if (updateResult.kind === 'open_work') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot change this PM schedule target while runtime-generated work order ${updateResult.openGeneratedWork.woNumber} is still ${updateResult.openGeneratedWork.status}. Complete or cancel that work order first.`,
        },
        { status: 409 },
      );
    }
    if (updateResult.kind === 'not_found') {
      return NextResponse.json({ success: false, error: 'PM schedule not found' }, { status: 404 });
    }
    if (updateResult.kind === 'trigger_conflict') {
      return NextResponse.json(
        {
          success: false,
          error: `Schedule change conflicts with the active PM trigger: ${updateResult.error}. Reconfigure or deactivate the trigger first.`,
        },
        { status: 409 },
      );
    }
    if (updateResult.kind === 'invalid_template') {
      return NextResponse.json(
        { success: false, error: 'PM template must be active and contain at least one active task' },
        { status: 400 },
      );
    }
    if (updateResult.kind === 'invalid_template_plant') {
      return NextResponse.json(
        { success: false, error: 'Task-level PM template must belong to the same plant as the schedule asset' },
        { status: 400 },
      );
    }
    if (updateResult.kind === 'task_level_conflict') {
      return NextResponse.json({ success: false, error: updateResult.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: updateResult.nextSchedule });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update PM schedule';
    if (error instanceof PmScheduleTaskValidationError) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (
      !hasPermission(session, 'pm_schedules.delete')
      && !hasPermission(session, 'work_orders.delete')
      && !isAdmin(session)
    ) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.pmSchedule.findUnique({
      where: { id },
      include: { asset: { select: { plantId: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'PM schedule not found' },
        { status: 404 }
      );
    }
    if (!canAccessPlantStrict(plantScope, existing.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const deactivated = await db.$transaction(async (tx) => {
      await lockPmScheduleLifecycle(tx, id);
      const updatedSchedule = await tx.pmSchedule.update({
      where: { id },
      data: { isActive: false },
    });

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'pm_schedule',
        entityId: id,
        oldValues: JSON.stringify({ title: existing.title, isActive: existing.isActive }),
        newValues: JSON.stringify({ isActive: false }),
      },
    });

      return updatedSchedule;
    });

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate PM schedule';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
