import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission } from '@/lib/auth';
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

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'pm_triggers.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get('scheduleId');
    const triggerType = searchParams.get('triggerType');
    const active = searchParams.get('active');

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};

    if (scheduleId) where.scheduleId = scheduleId;
    if (triggerType && VALID_TRIGGER_TYPES.includes(triggerType)) where.triggerType = triggerType;
    if (active !== null) where.isActive = active === 'true';

    // Trigger visibility follows the owning PM schedule asset. Regular users with
    // no explicit plant selection are still constrained to all assigned plants.
    if (!plantScope.isSystemWide) {
      where.schedule = {
        asset: {
          plantId: plantScope.isScoped && plantScope.plantId
            ? plantScope.plantId
            : { in: plantScope.accessiblePlantIds },
        },
      };
    }

    const triggers = await db.pmTrigger.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        schedule: {
          include: {
            asset: {
              select: { id: true, name: true, assetTag: true, status: true },
            },
            assignedTo: { select: { id: true, fullName: true, username: true } },
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: triggers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM triggers';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'pm_triggers.create')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { scheduleId, triggerType, triggerValue, triggerConfig, isActive } = body;

    if (!scheduleId) {
      return NextResponse.json({ success: false, error: 'scheduleId is required' }, { status: 400 });
    }
    if (!triggerType) {
      return NextResponse.json({ success: false, error: 'triggerType is required' }, { status: 400 });
    }
    if (!VALID_TRIGGER_TYPES.includes(triggerType)) {
      return NextResponse.json(
        { success: false, error: `triggerType must be one of: ${VALID_TRIGGER_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    if (triggerValue === undefined || triggerValue === null || typeof triggerValue !== 'number' || triggerValue <= 0) {
      return NextResponse.json({ success: false, error: 'triggerValue must be a positive number' }, { status: 400 });
    }

    const schedule = await db.pmSchedule.findUnique({
      where: { id: scheduleId },
      include: { asset: { select: { id: true, name: true, plantId: true } } },
    });

    if (!schedule) {
      return NextResponse.json({ success: false, error: 'PM schedule not found' }, { status: 400 });
    }
    if (!canAccessPlantStrict(plantScope, schedule.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    if (!schedule.isActive) {
      return NextResponse.json({ success: false, error: 'Cannot create a trigger for an inactive schedule' }, { status: 400 });
    }

    const existingTrigger = await db.pmTrigger.findUnique({ where: { scheduleId } });
    if (existingTrigger) {
      return NextResponse.json(
        { success: false, error: 'A trigger already exists for this schedule. Only one trigger per schedule is allowed.' },
        { status: 409 },
      );
    }

    const configError = validateTriggerConfig(triggerType, triggerConfig);
    if (configError) {
      return NextResponse.json({ success: false, error: configError }, { status: 400 });
    }

    const trigger = await db.pmTrigger.create({
      data: {
        scheduleId,
        triggerType,
        triggerValue,
        triggerConfig: JSON.stringify(triggerConfig),
        isActive: isActive !== undefined ? isActive : true,
      },
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
        action: 'create',
        entityType: 'pm_trigger',
        entityId: trigger.id,
        newValues: JSON.stringify({
          scheduleId,
          triggerType,
          triggerValue,
          triggerConfig,
          isActive: isActive !== undefined ? isActive : true,
        }),
      },
    });

    return NextResponse.json({ success: true, data: trigger }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create PM trigger';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
