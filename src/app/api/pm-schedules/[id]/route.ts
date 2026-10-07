import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { findOpenRuntimeGeneratedWorkOrder, normalizePmTriggerConfig, parsePmTriggerConfig } from '@/services/pm/triggerConfig.service';
import { isAutoCalculableFrequency, isPmFrequencyType } from '@/lib/pm-utils';

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
        template: { select: { id: true, title: true, type: true, _count: { select: { tasks: true } } } },
        createdBy: { select: { id: true, fullName: true, username: true } },
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

    return NextResponse.json({ success: true, data: schedule });
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
    if (!hasPermission(session, 'work_orders.update') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.pmSchedule.findUnique({
      where: { id },
      include: {
        asset: { select: { plantId: true } },
        trigger: {
          select: { id: true, triggerType: true, triggerValue: true, triggerConfig: true, isActive: true },
        },
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

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'title', 'description', 'frequencyType', 'frequencyValue',
      'lastCompletedDate', 'nextDueDate', 'estimatedDuration', 'priority',
      'assignedToId', 'departmentId', 'isActive', 'autoGenerateWO',
      'leadDays', 'woTypeId', 'componentId', 'templateId',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'lastCompletedDate' || field === 'nextDueDate') {
          const rawDate = body[field];
          const isBlankDate = rawDate === null
            || (typeof rawDate === 'string' && rawDate.trim() === '');
          if (isBlankDate) {
            updateData[field] = null;
          } else {
            const normalizedDate = new Date(rawDate);
            if (Number.isNaN(normalizedDate.getTime())) {
              const label = field === 'lastCompletedDate' ? 'Last completed date' : 'Next due date';
              return NextResponse.json(
                { success: false, error: `${label} must be a valid date` },
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
    }

    if (body.frequencyType !== undefined && !isPmFrequencyType(body.frequencyType)) {
      return NextResponse.json({ success: false, error: 'Invalid PM frequency type' }, { status: 400 });
    }
    if (body.frequencyValue !== undefined) {
      const normalizedFrequencyValue = Number(body.frequencyValue);
      if (!Number.isInteger(normalizedFrequencyValue) || normalizedFrequencyValue <= 0) {
        return NextResponse.json({ success: false, error: 'Frequency value must be a positive whole number' }, { status: 400 });
      }
      updateData.frequencyValue = normalizedFrequencyValue;
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

    const prospectiveScheduleFrequency = body.frequencyType !== undefined
      ? String(body.frequencyType)
      : existing.frequencyType;
    if (!isAutoCalculableFrequency(prospectiveScheduleFrequency)) {
      updateData.nextDueDate = null;
    }

    if (body.templateId !== undefined && body.templateId) {
      const template = await db.pmTemplate.findUnique({
        where: { id: body.templateId },
        select: { id: true, isActive: true },
      });
      if (!template || !template.isActive) {
        return NextResponse.json({ success: false, error: 'PM template not found or inactive' }, { status: 400 });
      }
    }

    if (body.componentId !== undefined && body.componentId) {
      const component = await db.componentRegistry.findUnique({
        where: { id: body.componentId },
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

    let reconciledTriggerConfig: string | undefined;
    let reconciledTriggerValue: number | undefined;
    const triggerTargetChanged = body.componentId !== undefined
      || body.frequencyType !== undefined
      || (existing.trigger?.triggerType === 'meter' && body.frequencyValue !== undefined);

    if (existing.trigger?.isActive && triggerTargetChanged) {
      const existingTriggerConfig = parsePmTriggerConfig(existing.trigger.triggerConfig);
      const openGeneratedWork = await findOpenRuntimeGeneratedWorkOrder(existingTriggerConfig, existing.id);
      if (openGeneratedWork) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot change this PM schedule target while runtime-generated work order ${openGeneratedWork.woNumber} is still ${openGeneratedWork.status}. Complete or cancel that work order first.`,
          },
          { status: 409 },
        );
      }

      const prospectiveFrequencyType = body.frequencyType !== undefined
        ? String(body.frequencyType)
        : existing.frequencyType;
      const prospectiveFrequencyValue = body.frequencyValue !== undefined
        ? Number(body.frequencyValue)
        : Number(existing.frequencyValue);
      const prospectiveComponentId = body.componentId !== undefined
        ? (body.componentId || null)
        : existing.componentId;
      const effectiveTriggerValue = existing.trigger.triggerType === 'meter'
        ? prospectiveFrequencyValue
        : existing.trigger.triggerValue;

      if (!Number.isFinite(effectiveTriggerValue) || effectiveTriggerValue <= 0) {
        return NextResponse.json({ success: false, error: 'PM trigger interval must remain a positive number' }, { status: 400 });
      }

      const normalized = await normalizePmTriggerConfig({
        triggerType: existing.trigger.triggerType,
        triggerValue: effectiveTriggerValue,
        triggerConfig: existingTriggerConfig,
        schedule: {
          id: existing.id,
          assetId: existing.assetId,
          componentId: prospectiveComponentId,
          frequencyType: prospectiveFrequencyType,
          asset: { plantId: existing.asset.plantId },
        },
        existingConfig: existingTriggerConfig,
      });
      if (normalized.error || !normalized.config) {
        return NextResponse.json(
          {
            success: false,
            error: `Schedule change conflicts with the active PM trigger: ${normalized.error || 'invalid trigger configuration'}. Reconfigure or deactivate the trigger first.`,
          },
          { status: 409 },
        );
      }
      reconciledTriggerConfig = JSON.stringify(normalized.config);
      reconciledTriggerValue = effectiveTriggerValue;
    }

    const updated = await db.$transaction(async (tx) => {
      const nextSchedule = await tx.pmSchedule.update({
        where: { id },
        data: updateData,
        include: {
          asset: { select: { id: true, name: true, assetTag: true, status: true } },
          component: { select: { id: true, name: true, componentCode: true, componentType: true, parentId: true, assetId: true } },
          assignedTo: { select: { id: true, fullName: true, username: true } },
          department: { select: { id: true, name: true, code: true } },
          template: { select: { id: true, title: true, type: true, _count: { select: { tasks: true } } } },
          createdBy: { select: { id: true, fullName: true, username: true } },
        },
      });

      if (existing.trigger && reconciledTriggerConfig !== undefined) {
        await tx.pmTrigger.update({
          where: { id: existing.trigger.id },
          data: {
            triggerConfig: reconciledTriggerConfig,
            ...(reconciledTriggerValue !== undefined ? { triggerValue: reconciledTriggerValue } : {}),
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
            title: existing.title,
            componentId: existing.componentId,
            frequencyType: existing.frequencyType,
            frequencyValue: existing.frequencyValue,
          }),
          newValues: JSON.stringify({
            ...updateData,
            ...(reconciledTriggerConfig !== undefined
              ? { reconciledTriggerId: existing.trigger?.id, reconciledTriggerValue }
              : {}),
          }),
        },
      });

      return nextSchedule;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update PM schedule';
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

    if (!hasPermission(session, 'work_orders.delete') && !isAdmin(session)) {
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

    const deactivated = await db.pmSchedule.update({
      where: { id },
      data: { isActive: false },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'pm_schedule',
        entityId: id,
        oldValues: JSON.stringify({ title: existing.title, isActive: existing.isActive }),
        newValues: JSON.stringify({ isActive: false }),
      },
    });

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate PM schedule';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
