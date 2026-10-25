import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { findAssetIdsByLiveLocationSearch, getAssetLiveLocationMap } from '@/lib/functional-location/live-location';
import { calculateNextDueDate, isPmFrequencyType } from '@/lib/pm-utils';
import { isCanonicalPmFrequencyType, normalizePmFrequency, validateCanonicalPmFrequency } from '@/lib/pm-frequency';
import { lockPmTemplateLifecycle } from '@/services/pm/templateLifecycle.service';
import { createPmScheduleTaskSnapshot, normalizePmScheduleTasks } from '@/services/pm/scheduleTaskSnapshot.service';
import { normalizePmScheduledTasks, syncPmScheduledTasks } from '@/services/pm/pmScheduleTask.service';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const componentId = searchParams.get('componentId');
    const isActive = searchParams.get('isActive');
    const dueSoon = searchParams.get('dueSoon');
    const search = searchParams.get('search');

    // Resolve plant scope (validates X-Plant-ID against user's plant access)
    // PmSchedule has no direct plantId — scope through the related Asset's plantId.
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};

    if (assetId) where.assetId = assetId;
    if (componentId) where.componentId = componentId;
    if (isActive !== null) {
      where.isActive = isActive === 'true';
    }
    if (dueSoon === 'true') {
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      where.frequencyType = { notIn: ['meter', 'meter_based'] };
      where.nextDueDate = { gte: now, lte: weekFromNow };
    }

    // Regular users must never fall through to an unrestricted schedule query.
    // Explicit plant selection narrows to one plant; otherwise scope to all plants
    // assigned to the user. An empty assignment list intentionally matches nothing.
    if (!plantScope.isSystemWide) {
      where.asset = {
        plantId: plantScope.isScoped && plantScope.plantId
          ? plantScope.plantId
          : { in: plantScope.accessiblePlantIds },
      };
    }

    if (search) {
      const locationAssetIds = await findAssetIdsByLiveLocationSearch(search);
      where.AND = [{
        OR: [
          { title: { contains: search } },
          { assetId: { in: locationAssetIds } },
        ],
      }];
    }

    const schedules = await db.pmSchedule.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        asset: {
          select: { id: true, name: true, assetTag: true, status: true },
        },
        component: {
          select: { id: true, name: true, componentCode: true, componentType: true, parentId: true, assetId: true },
        },
        assignedTo: { select: { id: true, fullName: true, username: true } },
        department: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
        template: { select: { id: true, title: true, type: true, _count: { select: { tasks: { where: { isActive: true } } } } } },
        tasks: { where: { isActive: true }, include: { pmTask: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
      orderBy: { nextDueDate: 'asc' },
    });

    const assetIds = [...new Set(schedules.map((schedule) => schedule.asset?.id || schedule.assetId).filter((id): id is string => Boolean(id)))];
    const liveLocations = await getAssetLiveLocationMap(assetIds);
    const enrichedSchedules = schedules.map((schedule) => ({
      ...schedule,
      scheduledTasks: schedule.tasks,
      asset: schedule.asset
        ? { ...schedule.asset, functionalLocation: liveLocations.get(schedule.asset.id) ?? null }
        : schedule.asset,
    }));

    return NextResponse.json({ success: true, data: enrichedSchedules });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM schedules';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (
      !hasPermission(session, 'pm_schedules.create')
      && !hasPermission(session, 'work_orders.create')
      && !isAdmin(session)
    ) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      assetId,
      componentId,
      frequencyType,
      frequencyValue,
      frequencyUnit,
      meterName,
      lastCompletedDate,
      nextDueDate,
      estimatedDuration,
      priority,
      assignedToId,
      departmentId,
      templateId,
      autoGenerateWO,
      leadDays,
      inlineTasks,
      scheduledTasks,
    } = body;

    if (!title || !assetId) {
      return NextResponse.json(
        { success: false, error: 'Title and asset are required' },
        { status: 400 }
      );
    }

    const scheduledTasksProvided = scheduledTasks !== undefined;
    const normalizedScheduledTasks = scheduledTasksProvided ? normalizePmScheduledTasks(scheduledTasks) : null;
    if (normalizedScheduledTasks && !normalizedScheduledTasks.ok) {
      return NextResponse.json({ success: false, error: normalizedScheduledTasks.error }, { status: 400 });
    }
    const effectiveFrequencyType = scheduledTasksProvided ? (frequencyType || 'time_day') : frequencyType;
    const effectiveFrequencyValue = scheduledTasksProvided && (frequencyValue === undefined || frequencyValue === null) ? 1 : frequencyValue;
    const effectiveFrequencyUnit = scheduledTasksProvided ? (frequencyUnit || 'days') : frequencyUnit;

    if (!effectiveFrequencyType || effectiveFrequencyValue === undefined || effectiveFrequencyValue === null) {
      return NextResponse.json(
        { success: false, error: 'Frequency type and value are required' },
        { status: 400 }
      );
    }

    if (!isPmFrequencyType(effectiveFrequencyType)) {
      return NextResponse.json({ success: false, error: 'Invalid PM frequency type' }, { status: 400 });
    }
    const normalizedFrequencyValue = Number(effectiveFrequencyValue);
    if (!Number.isInteger(normalizedFrequencyValue) || normalizedFrequencyValue <= 0) {
      return NextResponse.json({ success: false, error: 'Frequency value must be a positive whole number' }, { status: 400 });
    }

    if (isCanonicalPmFrequencyType(effectiveFrequencyType)) {
      const rawFrequencyValidation = validateCanonicalPmFrequency({
        frequencyType: effectiveFrequencyType,
        frequencyValue: normalizedFrequencyValue,
        frequencyUnit: effectiveFrequencyUnit,
        meterName,
      });
      if (!rawFrequencyValidation.ok) {
        return NextResponse.json({ success: false, error: rawFrequencyValidation.error }, { status: 400 });
      }
    }

    const canonicalFrequency = normalizePmFrequency({
      frequencyType: effectiveFrequencyType,
      frequencyValue: normalizedFrequencyValue,
      frequencyUnit: effectiveFrequencyUnit,
      meterName,
    });
    const legacyComponentUsageRequested = ['meter_based'].includes(effectiveFrequencyType)
      && !canonicalFrequency.meterName;
    if (!legacyComponentUsageRequested && !isCanonicalPmFrequencyType(effectiveFrequencyType)) {
      const frequencyValidation = validateCanonicalPmFrequency(canonicalFrequency);
      if (!frequencyValidation.ok) {
        return NextResponse.json({ success: false, error: frequencyValidation.error }, { status: 400 });
      }
    }

    const rawLeadDays = leadDays === undefined
      || leadDays === null
      || (typeof leadDays === 'string' && leadDays.trim() === '')
      ? 3
      : leadDays;
    const normalizedLeadDays = typeof rawLeadDays === 'number' || typeof rawLeadDays === 'string'
      ? Number(rawLeadDays)
      : Number.NaN;
    if (!Number.isInteger(normalizedLeadDays) || normalizedLeadDays < 0) {
      return NextResponse.json(
        { success: false, error: 'Lead days must be a non-negative whole number' },
        { status: 400 },
      );
    }

    const rawEstimatedDuration = estimatedDuration === undefined
      || estimatedDuration === null
      || (typeof estimatedDuration === 'string' && estimatedDuration.trim() === '')
      ? 0
      : estimatedDuration;
    const normalizedEstimatedDuration = typeof rawEstimatedDuration === 'number' || typeof rawEstimatedDuration === 'string'
      ? Number(rawEstimatedDuration)
      : Number.NaN;
    if (!Number.isFinite(normalizedEstimatedDuration) || normalizedEstimatedDuration < 0) {
      return NextResponse.json(
        { success: false, error: 'Estimated duration must be a non-negative number of hours' },
        { status: 400 },
      );
    }

    const inlineTasksProvided = inlineTasks !== undefined;
    const normalizedInlineTasksResult = inlineTasksProvided ? normalizePmScheduleTasks(inlineTasks) : null;
    if (normalizedInlineTasksResult && !normalizedInlineTasksResult.ok) {
      return NextResponse.json({ success: false, error: normalizedInlineTasksResult.error }, { status: 400 });
    }
    const normalizedInlineTasks = normalizedInlineTasksResult?.ok ? normalizedInlineTasksResult.tasks : [];

    const isBlankLastCompletedDate = lastCompletedDate === undefined
      || lastCompletedDate === null
      || (typeof lastCompletedDate === 'string' && lastCompletedDate.trim() === '');
    const normalizedLastCompletedDate = isBlankLastCompletedDate ? null : new Date(lastCompletedDate);
    if (normalizedLastCompletedDate && Number.isNaN(normalizedLastCompletedDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Last completed date must be a valid date' },
        { status: 400 },
      );
    }

    const isBlankNextDueDate = nextDueDate === undefined
      || nextDueDate === null
      || (typeof nextDueDate === 'string' && nextDueDate.trim() === '');
    const normalizedNextDueDate = isBlankNextDueDate ? null : new Date(nextDueDate);
    if (normalizedNextDueDate && Number.isNaN(normalizedNextDueDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Next due date must be a valid date' },
        { status: 400 },
      );
    }

    // Validate asset exists and belongs to the caller's active/assigned plant scope.
    const assetExists = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, plantId: true },
    });
    if (!assetExists) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 400 });
    }
    if (!canAccessPlantStrict(plantScope, assetExists.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    let componentForTrigger: { id: string; assetId: string | null; name: string; componentCode: string; operatingHours: number } | null = null;
    if (componentId) {
      const component = await db.componentRegistry.findUnique({
        where: { id: componentId },
        select: { id: true, assetId: true, name: true, componentCode: true, operatingHours: true },
      });
      if (!component) {
        return NextResponse.json({ success: false, error: 'Component not found' }, { status: 400 });
      }
      if (component.assetId !== assetId) {
        return NextResponse.json(
          { success: false, error: 'Selected component does not belong to the selected asset' },
          { status: 400 },
        );
      }
      componentForTrigger = component;
    }

    // Canonical Meter schedules are driven by a real meter reading on the selected
    // asset. Historical meter_based component-hour clients remain supported without rewriting
    // their persisted semantics until a planner explicitly edits those schedules.
    let selectedMeter: { id: string; value: number; meterName: string; unit: string } | null = null;
    if (canonicalFrequency.frequencyType === 'meter' && canonicalFrequency.meterName) {
      selectedMeter = await db.meterReading.findFirst({
        where: {
          assetId,
          meterName: canonicalFrequency.meterName,
          unit: canonicalFrequency.frequencyUnit,
        },
        orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, value: true, meterName: true, unit: true },
      });
      if (!selectedMeter) {
        return NextResponse.json(
          { success: false, error: 'Selected meter has no reading for this asset' },
          { status: 400 },
        );
      }
    } else if (canonicalFrequency.frequencyType === 'meter' && !legacyComponentUsageRequested) {
      const frequencyValidation = validateCanonicalPmFrequency(canonicalFrequency);
      return NextResponse.json(
        { success: false, error: frequencyValidation.ok ? 'Selected meter is required' : frequencyValidation.error },
        { status: 400 },
      );
    } else if (legacyComponentUsageRequested && !componentForTrigger) {
      return NextResponse.json(
        { success: false, error: 'Legacy runtime-hour PM requires a component target or migration to a configured asset meter' },
        { status: 400 },
      );
    }

    const preserveLegacyComponentUsage = legacyComponentUsageRequested && Boolean(componentForTrigger);
    const storedFrequencyType = preserveLegacyComponentUsage ? effectiveFrequencyType : canonicalFrequency.frequencyType;
    const storedFrequencyUnit = preserveLegacyComponentUsage ? null : canonicalFrequency.frequencyUnit;
    const storedMeterName = preserveLegacyComponentUsage ? null : canonicalFrequency.meterName;
    const calendarFrequency = preserveLegacyComponentUsage ? null : canonicalFrequency;
    const canonicalNextDueDate = !scheduledTasksProvided && calendarFrequency?.frequencyType === 'time_day'
      ? (normalizedNextDueDate ?? calculateNextDueDate(
          normalizedLastCompletedDate ?? new Date(),
          calendarFrequency.frequencyType,
          calendarFrequency.frequencyValue,
          calendarFrequency.frequencyUnit,
        ))
      : null;
    const effectiveLeadDays = !scheduledTasksProvided && calendarFrequency?.frequencyType === 'time_day' ? normalizedLeadDays : 0;

    const scheduleResult = await db.$transaction(async (tx) => {
      let effectiveTemplateId = templateId || null;
      if (inlineTasksProvided) {
        effectiveTemplateId = normalizedInlineTasks.length > 0
          ? await createPmScheduleTaskSnapshot(tx, {
              scheduleTitle: title,
              scheduleDescription: description || null,
              estimatedDurationHours: normalizedEstimatedDuration,
              priority: priority || 'medium',
              createdById: session.userId,
              plantId: assetExists.plantId,
              tasks: normalizedInlineTasks,
            })
          : null;
      } else if (templateId) {
        await lockPmTemplateLifecycle(tx, templateId);
        const template = await tx.pmTemplate.findUnique({
          where: { id: templateId },
          select: {
            id: true,
            isActive: true,
            tasks: { where: { isActive: true }, take: 1, select: { id: true } },
          },
        });
        if (!template || !template.isActive || template.tasks.length === 0) {
          return { kind: 'invalid_template' as const };
        }
      }

      const createdSchedule = await tx.pmSchedule.create({
        data: {
          title,
          description: description || null,
          assetId,
          componentId: componentId || null,
          frequencyType: storedFrequencyType,
          frequencyValue: canonicalFrequency.frequencyValue,
          frequencyUnit: storedFrequencyUnit,
          meterName: storedMeterName,
          lastCompletedDate: normalizedLastCompletedDate,
          nextDueDate: canonicalNextDueDate,
          estimatedDuration: normalizedEstimatedDuration,
          priority: priority || 'medium',
          assignedToId: assignedToId || null,
          departmentId: departmentId || null,
          templateId: effectiveTemplateId,
          autoGenerateWO: scheduledTasksProvided ? false : (autoGenerateWO !== undefined ? autoGenerateWO : true),
          leadDays: effectiveLeadDays,
          createdById: session.userId,
        },
        include: {
          asset: { select: { id: true, name: true, assetTag: true, status: true } },
          component: { select: { id: true, name: true, componentCode: true, componentType: true, parentId: true, assetId: true } },
          assignedTo: { select: { id: true, fullName: true, username: true } },
          department: { select: { id: true, name: true, code: true } },
          template: { select: { id: true, title: true, type: true, _count: { select: { tasks: { where: { isActive: true } } } } } },
          createdBy: { select: { id: true, fullName: true, username: true } },
        },
      });

      const taskRows = scheduledTasksProvided
        ? await syncPmScheduledTasks(tx, {
            scheduleId: createdSchedule.id, plantId: assetExists.plantId, assetId,
            componentId: componentId || null, tasks: scheduledTasks,
          })
        : [];

      if (selectedMeter) {
        await tx.pmTrigger.create({
          data: {
            scheduleId: createdSchedule.id,
            triggerType: 'meter',
            triggerValue: canonicalFrequency.frequencyValue,
            triggerConfig: JSON.stringify({
              source: 'asset_meter_reading',
              assetId,
              meterName: selectedMeter.meterName,
              unit: selectedMeter.unit,
              threshold: canonicalFrequency.frequencyValue,
              baselineValue: Number(selectedMeter.value),
              baselineReadingId: selectedMeter.id,
            }),
            isActive: true,
          },
        });
      } else if (
        componentForTrigger
        && preserveLegacyComponentUsage
        && Number(effectiveFrequencyValue) > 0
      ) {
        await tx.pmTrigger.create({
          data: {
            scheduleId: createdSchedule.id,
            triggerType: 'meter',
            triggerValue: normalizedFrequencyValue,
            triggerConfig: JSON.stringify({
              source: 'component_operating_hours',
              componentId: componentForTrigger.id,
              meterName: `${componentForTrigger.componentCode} operating hours`,
              baselineHours: Number(componentForTrigger.operatingHours || 0),
              unit: 'hours',
            }),
            isActive: true,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'create',
          entityType: 'pm_schedule',
          entityId: createdSchedule.id,
          newValues: JSON.stringify({
            title,
            assetId,
            componentId: componentId || null,
            templateId: effectiveTemplateId,
            frequencyType: storedFrequencyType,
            frequencyValue: canonicalFrequency.frequencyValue,
            frequencyUnit: storedFrequencyUnit,
            meterName: storedMeterName,
          }),
        },
      });

      return { kind: 'created' as const, createdSchedule: { ...createdSchedule, scheduledTasks: taskRows } };
    });

    if (scheduleResult.kind === 'invalid_template') {
      return NextResponse.json(
        { success: false, error: 'PM template must be active and contain at least one active task' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, data: scheduleResult.createdSchedule }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create PM schedule';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
