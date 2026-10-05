import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getComponentPlantAccess } from '@/lib/component-plant-access';
import { createAuditLog } from '@/lib/audit';

function nextCalendarDue(from: Date, frequency: string): Date | null {
  const next = new Date(from);
  switch (frequency) {
    case 'weekly': next.setDate(next.getDate() + 7); return next;
    case 'monthly': next.setMonth(next.getMonth() + 1); return next;
    case 'quarterly': next.setMonth(next.getMonth() + 3); return next;
    case 'biannually': next.setMonth(next.getMonth() + 6); return next;
    case 'annually': next.setFullYear(next.getFullYear() + 1); return next;
    default: return null;
  }
}

async function authorize(request: NextRequest, session: NonNullable<ReturnType<typeof getSession>>, id: string) {
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
    const denied = await authorize(request, session, id);
    if (denied) return denied;

    const schedules = await db.componentLubricationSchedule.findMany({
      where: { componentId: id, isActive: true },
      orderBy: [{ nextDueDate: 'asc' }, { lubricantName: 'asc' }],
      include: {
        records: {
          orderBy: { performedAt: 'desc' },
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const denied = await authorize(request, session, id);
    if (denied) return denied;

    const body = await request.json();
    const scheduleId = typeof body.scheduleId === 'string' ? body.scheduleId : '';
    if (!scheduleId) return NextResponse.json({ success: false, error: 'scheduleId is required' }, { status: 400 });

    const schedule = await db.componentLubricationSchedule.findFirst({
      where: { id: scheduleId, componentId: id, isActive: true },
    });
    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Lubrication schedule not found for this component' }, { status: 404 });
    }

    const quantity = body.quantityUsed === undefined || body.quantityUsed === null
      ? schedule.quantity
      : Number(body.quantityUsed);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ success: false, error: 'quantityUsed must be a positive number' }, { status: 400 });
    }

    const operatingHoursAt = body.operatingHoursAt == null ? null : Number(body.operatingHoursAt);
    if (operatingHoursAt != null && (!Number.isFinite(operatingHoursAt) || operatingHoursAt < 0)) {
      return NextResponse.json({ success: false, error: 'operatingHoursAt must be a non-negative number' }, { status: 400 });
    }

    const performedAt = new Date();
    const record = await db.componentLubricationRecord.create({
      data: {
        scheduleId,
        componentId: id,
        lubricantName: schedule.lubricantName,
        quantityUsed: quantity,
        unit: typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : schedule.unit,
        operatingHoursAt,
        performedById: session.userId,
        performedAt,
        notes: typeof body.notes === 'string' ? body.notes : null,
      },
    });

    await db.componentLubricationSchedule.update({
      where: { id: scheduleId },
      data: {
        lastLubricated: performedAt,
        nextDueDate: schedule.frequencyHours ? null : nextCalendarDue(performedAt, schedule.frequency),
      },
    });

    await createAuditLog(session.userId, 'component_lubrication_record', 'create', record.id, {
      newValues: { componentId: id, scheduleId, quantityUsed: quantity, lubricantName: schedule.lubricantName },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record lubrication activity';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
