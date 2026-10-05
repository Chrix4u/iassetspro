import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getComponentPlantAccess } from '@/lib/component-plant-access';
import { createAuditLog } from '@/lib/audit';

function parseNormalRange(raw: string | null): { min: number | null; max: number | null; unit: string | null } {
  if (!raw) return { min: null, max: null, unit: null };
  try {
    const parsed = JSON.parse(raw) as { min?: unknown; max?: unknown; unit?: unknown };
    const min = typeof parsed.min === 'number' && Number.isFinite(parsed.min) ? parsed.min : null;
    const max = typeof parsed.max === 'number' && Number.isFinite(parsed.max) ? parsed.max : null;
    const unit = typeof parsed.unit === 'string' && parsed.unit.trim() ? parsed.unit.trim() : null;
    return { min, max, unit };
  } catch {
    return { min: null, max: null, unit: null };
  }
}

async function authorizeComponent(request: NextRequest, session: NonNullable<ReturnType<typeof getSession>>, id: string) {
  const access = await getComponentPlantAccess(request, session, id);
  if (!access.exists) return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
  if (!access.allowed) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const denied = await authorizeComponent(request, session, id);
    if (denied) return denied;

    const allReadings = await db.componentConditionReading.findMany({
      where: { componentId: id },
      orderBy: [{ parameterKey: 'asc' }, { recordedAt: 'desc' }],
    });

    const grouped = new Map<string, typeof allReadings>();
    for (const reading of allReadings) {
      const readings = grouped.get(reading.parameterKey) || [];
      readings.push(reading);
      grouped.set(reading.parameterKey, readings);
    }

    const result = Array.from(grouped.entries()).map(([parameterKey, readings]) => {
      const latest = readings[0];
      return {
        parameterKey,
        latestValue: latest.value,
        unit: latest.unit,
        isAlarm: latest.isAlarm,
        quality: latest.quality,
        source: latest.source,
        minThreshold: latest.minThreshold,
        maxThreshold: latest.maxThreshold,
        recordedAt: latest.recordedAt,
        trend: readings.slice(0, 5).map((reading) => ({
          value: reading.value,
          recordedAt: reading.recordedAt,
          isAlarm: reading.isAlarm,
        })),
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load condition readings';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const denied = await authorizeComponent(request, session, id);
    if (denied) return denied;

    const body = await request.json();
    const parameterKey = typeof body.parameterKey === 'string' ? body.parameterKey.trim() : '';
    const numericValue = Number(body.value);
    if (!parameterKey) return NextResponse.json({ success: false, error: 'parameterKey is required' }, { status: 400 });
    if (!Number.isFinite(numericValue)) return NextResponse.json({ success: false, error: 'value must be a finite number' }, { status: 400 });

    const inspectionPoint = await db.componentInspectionPoint.findFirst({
      where: { componentId: id, parameterKey, isActive: true },
      select: { normalRange: true },
    });
    const range = parseNormalRange(inspectionPoint?.normalRange || null);

    const bodyMin = body.minThreshold == null ? null : Number(body.minThreshold);
    const bodyMax = body.maxThreshold == null ? null : Number(body.maxThreshold);
    const minThreshold = Number.isFinite(bodyMin) ? bodyMin : range.min;
    const maxThreshold = Number.isFinite(bodyMax) ? bodyMax : range.max;
    const unit = (typeof body.unit === 'string' && body.unit.trim()) ? body.unit.trim() : (range.unit || 'unit');
    const qualityValue = Number(body.quality);
    const quality = Number.isFinite(qualityValue) ? Math.max(0, Math.min(100, Math.round(qualityValue))) : 100;
    const isAlarm = (minThreshold != null && numericValue < minThreshold) || (maxThreshold != null && numericValue > maxThreshold);

    const reading = await db.componentConditionReading.create({
      data: {
        componentId: id,
        parameterKey,
        value: numericValue,
        unit,
        quality,
        minThreshold,
        maxThreshold,
        isAlarm,
        source: typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'manual',
        recordedAt: new Date(),
        recordedById: session.userId,
      },
    });

    await createAuditLog(session.userId, 'component_condition_reading', 'create', reading.id, {
      newValues: { componentId: id, parameterKey, value: numericValue, unit, quality, minThreshold, maxThreshold, isAlarm },
    });

    return NextResponse.json({ success: true, data: reading }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record condition reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
