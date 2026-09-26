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

    const counters = await db.componentRuntimeCounter.findMany({
      where: { componentId: id },
      orderBy: { counterType: 'asc' },
    });

    // Get latest condition reading timestamps for each counter
    const enrichedCounters = await Promise.all(
      counters.map(async (counter) => {
        const latestReading = await db.componentConditionReading.findFirst({
          where: { componentId: id, parameterKey: counter.counterType },
          orderBy: { recordedAt: 'desc' },
          select: { recordedAt: true, value: true },
        });

        return {
          ...counter,
          lastReadingAt: latestReading?.recordedAt ?? null,
          lastReadingValue: latestReading?.value ?? null,
          isRunning: counter.isRunning ?? false,
        };
      }),
    );

    return NextResponse.json({ success: true, data: enrichedCounters });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load runtime counters';
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
    const { counterType, value, isRunning } = body;

    if (!counterType) {
      return NextResponse.json({ success: false, error: 'counterType is required' }, { status: 400 });
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

    // Upsert: create if doesn't exist, update if exists
    const existingCounter = await db.componentRuntimeCounter.findFirst({
      where: { componentId: id, counterType },
    });

    let counter;
    if (existingCounter) {
      counter = await db.componentRuntimeCounter.update({
        where: { id: existingCounter.id },
        data: {
          value: parseFloat(String(value)),
          isRunning: isRunning !== undefined ? Boolean(isRunning) : existingCounter.isRunning,
          updatedAt: new Date(),
        },
      });
    } else {
      counter = await db.componentRuntimeCounter.create({
        data: {
          componentId: id,
          counterType,
          value: parseFloat(String(value)),
          unit: body.unit || null,
          isRunning: isRunning !== undefined ? Boolean(isRunning) : false,
        },
      });
    }

    await createAuditLog(
      session.userId,
      'component_runtime_counter',
      existingCounter ? 'update' : 'create',
      counter.id,
      {
        newValues: { componentId: id, counterType, value, isRunning },
      },
    );

    return NextResponse.json({ success: true, data: counter }, { status: existingCounter ? 200 : 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update runtime counter';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
