import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getComponentPlantAccess } from '@/lib/component-plant-access';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const componentAccess = await getComponentPlantAccess(request, session, id);
    if (!componentAccess.exists) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }
    if (!componentAccess.allowed) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    // Get all distinct parameter keys
    const allReadings = await db.componentConditionReading.findMany({
      where: { componentId: id },
      orderBy: [{ parameterKey: 'asc' }, { recordedAt: 'desc' }],
    });

    // Group by parameterKey
    const grouped = new Map<string, typeof allReadings>();
    for (const reading of allReadings) {
      if (!grouped.has(reading.parameterKey)) {
        grouped.set(reading.parameterKey, []);
      }
      grouped.get(reading.parameterKey)!.push(reading);
    }

    // Build result: latest value + trend (last 5 readings)
    const result = Array.from(grouped.entries()).map(([key, readings]) => {
      const latest = readings[0];
      const trend = readings.slice(0, 5).map((r) => ({
        value: r.value,
        recordedAt: r.recordedAt,
        isAlarm: r.isAlarm,
      }));

      return {
        parameterKey: key,
        latestValue: latest.value,
        unit: latest.unit,
        isAlarm: latest.isAlarm ?? false,
        quality: latest.quality,
        source: latest.source,
        recordedAt: latest.recordedAt,
        trend,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load condition readings';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const componentAccess = await getComponentPlantAccess(request, session, id);
    if (!componentAccess.exists) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }
    if (!componentAccess.allowed) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    const body = await request.json();
    const { parameterKey, value, unit, quality, source } = body;

    if (!parameterKey) {
      return NextResponse.json({ success: false, error: 'parameterKey is required' }, { status: 400 });
    }

    if (value === undefined || value === null) {
      return NextResponse.json({ success: false, error: 'value is required' }, { status: 400 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    // Check against thresholds to determine alarm status
    // Look for existing inspection points with thresholds for this parameter
    let isAlarm = false;
    const inspectionPoint = await db.componentInspectionPoint.findFirst({
      where: { componentId: id, parameterKey },
    });

    if (inspectionPoint && (inspectionPoint as Record<string, unknown>).alarmThreshold) {
      const threshold = parseFloat(String((inspectionPoint as Record<string, unknown>).alarmThreshold));
      const numericValue = parseFloat(String(value));
      if (!isNaN(threshold) && !isNaN(numericValue)) {
        isAlarm = numericValue >= threshold;
      }
    }

    const reading = await db.componentConditionReading.create({
      data: {
        componentId: id,
        parameterKey,
        value: parseFloat(String(value)),
        unit: unit || null,
        quality: quality || 'good',
        source: source || 'manual',
        isAlarm,
        recordedAt: new Date(),
      },
    });

    await createAuditLog(
      session.userId,
      'component_condition_reading',
      'create',
      reading.id,
      {
        newValues: { componentId: id, parameterKey, value, isAlarm },
      },
    );

    return NextResponse.json({ success: true, data: reading }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record condition reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
