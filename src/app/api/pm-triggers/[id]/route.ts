import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { normalizePmTriggerConfig, parsePmTriggerConfig, VALID_PM_TRIGGER_TYPES } from '@/services/pm/triggerConfig.service';

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

    if (body.triggerConfig !== undefined || body.triggerType !== undefined || body.triggerValue !== undefined) {
      const effectiveType = body.triggerType || existing.triggerType;
      const effectiveValue = body.triggerValue !== undefined ? body.triggerValue : existing.triggerValue;
      const effectiveConfig = body.triggerConfig !== undefined
        ? body.triggerConfig
        : parsePmTriggerConfig(existing.triggerConfig);
      const normalized = await normalizePmTriggerConfig({
        triggerType: effectiveType,
        triggerValue: effectiveValue,
        triggerConfig: effectiveConfig,
        schedule: existing.schedule,
        existingConfig: parsePmTriggerConfig(existing.triggerConfig),
      });
      if (normalized.error || !normalized.config) {
        return NextResponse.json({ success: false, error: normalized.error || 'Invalid trigger configuration' }, { status: 400 });
      }
      updateData.triggerConfig = JSON.stringify(normalized.config);
    }

    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await db.pmTrigger.update({
      where: { id },
      data: updateData,
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

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'pm_trigger',
        entityId: id,
        oldValues: JSON.stringify({
          triggerType: existing.triggerType,
          triggerValue: existing.triggerValue,
          isActive: existing.isActive,
        }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
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

    const deactivated = await db.pmTrigger.update({
      where: { id },
      data: { isActive: false },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'pm_trigger',
        entityId: id,
        oldValues: JSON.stringify({
          triggerType: existing.triggerType,
          triggerValue: existing.triggerValue,
          isActive: existing.isActive,
        }),
        newValues: JSON.stringify({ isActive: false }),
      },
    });

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate PM trigger';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
