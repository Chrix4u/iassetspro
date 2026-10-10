import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { findOpenRuntimeGeneratedWorkOrder, normalizePmTriggerConfig, parsePmTriggerConfig, VALID_PM_TRIGGER_TYPES } from '@/services/pm/triggerConfig.service';
import { lockPmScheduleLifecycle } from '@/services/pm/templateLifecycle.service';

const VALID_TRIGGER_TYPES: string[] = [...VALID_PM_TRIGGER_TYPES];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'pm_triggers.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    const trigger = await db.pmTrigger.findUnique({
      where: { id },
      include: {
        schedule: {
          include: {
            asset: { select: { id: true, name: true, assetTag: true, status: true, criticality: true, plantId: true } },
            assignedTo: { select: { id: true, fullName: true, username: true } },
            department: { select: { id: true, name: true, code: true } },
            createdBy: { select: { id: true, fullName: true, username: true } },
          },
        },
      },
    });

    if (!trigger) {
      return NextResponse.json({ success: false, error: 'PM trigger not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, trigger.schedule.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: trigger });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM trigger';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'pm_triggers.update')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.pmTrigger.findUnique({
      where: { id },
      include: { schedule: { include: { asset: { select: { plantId: true } } } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'PM trigger not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, existing.schedule.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (body.triggerType !== undefined) {
      if (!VALID_TRIGGER_TYPES.includes(body.triggerType)) {
        return NextResponse.json(
          { success: false, error: `triggerType must be one of: ${VALID_TRIGGER_TYPES.join(', ')}` },
          { status: 400 },
        );
      }
      updateData.triggerType = body.triggerType;
    }

    if (body.triggerValue !== undefined) {
      if (typeof body.triggerValue !== 'number' || body.triggerValue <= 0) {
        return NextResponse.json({ success: false, error: 'triggerValue must be a positive number' }, { status: 400 });
      }
      updateData.triggerValue = body.triggerValue;
    }

    const configurationChanging = body.triggerConfig !== undefined
      || body.triggerType !== undefined
      || body.triggerValue !== undefined;

    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    if (Object.keys(updateData).length === 0 && !configurationChanging) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await db.$transaction(async (tx) => {
      await lockPmScheduleLifecycle(tx, existing.scheduleId);
      const lockedTrigger = await tx.pmTrigger.findUnique({
        where: { id },
        include: { schedule: { include: { asset: { select: { plantId: true } } } } },
      });
      if (!lockedTrigger) return { kind: 'not_found' as const };

      const lockedCurrentConfig = parsePmTriggerConfig(lockedTrigger.triggerConfig);
      const lockedReactivating = body.isActive === true && !lockedTrigger.isActive;
      const lockedUpdateData: Record<string, unknown> = { ...updateData };

      if (configurationChanging || lockedReactivating) {
        const lockedOpenGeneratedWork = await findOpenRuntimeGeneratedWorkOrder(
          lockedCurrentConfig,
          lockedTrigger.scheduleId,
          tx,
        );
        if (lockedOpenGeneratedWork) {
          return { kind: 'open_work' as const, openGeneratedWork: lockedOpenGeneratedWork };
        }

        const effectiveType = body.triggerType || lockedTrigger.triggerType;
        const effectiveValue = body.triggerValue !== undefined ? body.triggerValue : lockedTrigger.triggerValue;
        const effectiveConfig = body.triggerConfig !== undefined ? body.triggerConfig : lockedCurrentConfig;
        const normalized = await normalizePmTriggerConfig({
          triggerType: effectiveType,
          triggerValue: effectiveValue,
          triggerConfig: effectiveConfig,
          schedule: lockedTrigger.schedule,
          existingConfig: lockedCurrentConfig,
        });
        if (normalized.error || !normalized.config) {
          return { kind: 'invalid_config' as const, error: normalized.error || 'Invalid trigger configuration' };
        }
        lockedUpdateData.triggerConfig = JSON.stringify(normalized.config);

        if (
          effectiveType === 'meter'
          && body.triggerValue !== undefined
          && ['meter_based', 'custom_hours'].includes(lockedTrigger.schedule.frequencyType)
        ) {
          await tx.pmSchedule.update({
            where: { id: lockedTrigger.scheduleId },
            data: { frequencyValue: effectiveValue },
          });
        }
      }

      const updatedTrigger = await tx.pmTrigger.update({
        where: { id },
        data: lockedUpdateData,
        include: {
          schedule: {
            include: {
              asset: { select: { id: true, name: true, assetTag: true, status: true } },
              assignedTo: { select: { id: true, fullName: true, username: true } },
              department: { select: { id: true, name: true, code: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'pm_trigger',
          entityId: id,
          oldValues: JSON.stringify({
            triggerType: lockedTrigger.triggerType,
            triggerValue: lockedTrigger.triggerValue,
            isActive: lockedTrigger.isActive,
          }),
          newValues: JSON.stringify(lockedUpdateData),
        },
      });

      return { kind: 'updated' as const, updatedTrigger };
    });

    if (updated.kind === 'open_work') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot reconfigure or reactivate this PM trigger while generated work order ${updated.openGeneratedWork.woNumber} is still ${updated.openGeneratedWork.status}. Complete or cancel that work order first.`,
        },
        { status: 409 },
      );
    }
    if (updated.kind === 'not_found') {
      return NextResponse.json({ success: false, error: 'PM trigger not found' }, { status: 404 });
    }
    if (updated.kind === 'invalid_config') {
      return NextResponse.json({ success: false, error: updated.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: updated.updatedTrigger });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update PM trigger';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.pmTrigger.findUnique({
      where: { id },
      include: { schedule: { include: { asset: { select: { plantId: true } } } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'PM trigger not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(plantScope, existing.schedule.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ success: false, error: 'Trigger is already deactivated' }, { status: 400 });
    }

    const deactivated = await db.$transaction(async (tx) => {
      await lockPmScheduleLifecycle(tx, existing.scheduleId);
      const lockedTrigger = await tx.pmTrigger.findUnique({
        where: { id },
        select: { id: true, triggerType: true, triggerValue: true, isActive: true },
      });
      if (!lockedTrigger) return { kind: 'not_found' as const };
      if (!lockedTrigger.isActive) return { kind: 'already_inactive' as const };

      const deactivatedTrigger = await tx.pmTrigger.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'delete',
          entityType: 'pm_trigger',
          entityId: id,
          oldValues: JSON.stringify({
            triggerType: lockedTrigger.triggerType,
            triggerValue: lockedTrigger.triggerValue,
            isActive: lockedTrigger.isActive,
          }),
          newValues: JSON.stringify({ isActive: false }),
        },
      });

      return { kind: 'deactivated' as const, deactivatedTrigger };
    });

    if (deactivated.kind === 'not_found') {
      return NextResponse.json({ success: false, error: 'PM trigger not found' }, { status: 404 });
    }
    if (deactivated.kind === 'already_inactive') {
      return NextResponse.json({ success: false, error: 'Trigger is already deactivated' }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: deactivated.deactivatedTrigger });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate PM trigger';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
