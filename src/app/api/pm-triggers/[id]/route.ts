import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

const VALID_TRIGGER_TYPES = ['time', 'meter', 'condition', 'production_count'];

function validateTriggerConfig(triggerType: string, triggerConfig: unknown): string | null {
  if (!triggerConfig || typeof triggerConfig !== 'object') {
    return `triggerConfig is required and must be an object for ${triggerType}`;
  }

  const config = triggerConfig as Record<string, unknown>;

  switch (triggerType) {
    case 'time': {
      if (typeof config.cron !== 'string' || config.cron.trim().length === 0) {
        return 'time trigger requires a "cron" field in triggerConfig (e.g. {"cron": "0 6 * * *"})';
      }
      const parts = config.cron.trim().split(/\s+/);
      if (parts.length < 5 || parts.length > 6) {
        return 'Invalid cron expression: must have 5 or 6 space-separated fields';
      }
      break;
    }
    case 'meter': {
      if (typeof config.meterName !== 'string' || config.meterName.trim().length === 0) {
        return 'meter trigger requires a "meterName" field in triggerConfig';
      }
      if (typeof config.threshold !== 'number' || config.threshold <= 0) {
        return 'meter trigger requires a positive numeric "threshold" field in triggerConfig';
      }
      break;
    }
    case 'condition': {
      if (typeof config.metric !== 'string' || config.metric.trim().length === 0) {
        return 'condition trigger requires a "metric" field in triggerConfig';
      }
      const validOperators = ['>', '<', '>=', '<=', '=', '==', '!='];
      if (typeof config.operator !== 'string' || !validOperators.includes(config.operator)) {
        return `condition trigger requires a valid "operator" field: one of ${validOperators.join(', ')}`;
      }
      if (typeof config.value !== 'number') {
        return 'condition trigger requires a numeric "value" field in triggerConfig';
      }
      break;
    }
    case 'production_count': {
      if (typeof config.threshold !== 'number' || config.threshold <= 0) {
        return 'production_count trigger requires a positive numeric "threshold" field in triggerConfig';
      }
      break;
    }
    default:
      return `Unknown triggerType: ${triggerType}`;
  }

  return null;
}

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

    if (body.triggerConfig !== undefined) {
      const effectiveType = body.triggerType || existing.triggerType;
      const configError = validateTriggerConfig(effectiveType, body.triggerConfig);
      if (configError) {
        return NextResponse.json({ success: false, error: configError }, { status: 400 });
      }
      updateData.triggerConfig = JSON.stringify(body.triggerConfig);
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
