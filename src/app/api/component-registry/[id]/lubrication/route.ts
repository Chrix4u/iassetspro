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

    // Get lubrication schedules with recent records
    const schedules = await db.componentLubricationSchedule.findMany({
      where: { componentId: id },
      orderBy: { scheduleType: 'asc' },
      include: {
        lubricationRecords: {
          orderBy: { lubricatedAt: 'desc' },
          take: 10,
        },
      },
    });

    return NextResponse.json({ success: true, data: schedules });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load lubrication data';
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
    const { scheduleId, quantityUsed, unit, operatingHoursAt, notes } = body;

    if (!scheduleId) {
      return NextResponse.json({ success: false, error: 'scheduleId is required' }, { status: 400 });
    }

    const component = await db.componentRegistry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!component) {
      return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
    }

    // Validate schedule belongs to this component
    const schedule = await db.componentLubricationSchedule.findFirst({
      where: { id: scheduleId, componentId: id },
    });
    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Lubrication schedule not found for this component' }, { status: 404 });
    }

    // Create lubrication record
    const record = await db.componentLubricationRecord.create({
      data: {
        scheduleId,
        componentId: id,
        quantityUsed: quantityUsed !== undefined ? parseFloat(String(quantityUsed)) : null,
        unit: unit || null,
        operatingHoursAt: operatingHoursAt !== undefined ? parseFloat(String(operatingHoursAt)) : null,
        notes: notes || null,
        lubricatedAt: new Date(),
        lubricatedBy: session.userId,
      },
    });

    // Update schedule lastLubricated and compute nextDueDate
    const updateData: Record<string, unknown> = {
      lastLubricated: new Date(),
    };

    if (schedule.intervalDays && schedule.intervalDays > 0) {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + schedule.intervalDays);
      updateData.nextDueDate = nextDate;
    }

    await db.componentLubricationSchedule.update({
      where: { id: scheduleId },
      data: updateData,
    });

    await createAuditLog(
      session.userId,
      'component_lubrication_record',
      'create',
      record.id,
      {
        newValues: { componentId: id, scheduleId, quantityUsed },
      },
    );

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record lubrication activity';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
